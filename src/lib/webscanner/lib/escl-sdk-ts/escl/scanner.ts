// @ts-nocheck
import { getScanSettingConfig, getScannerBrightness } from './getCapabilities'
import { getScanSetting } from './serializeScanSetting'

import request from '../utils/request'
/**
 * 
 * @param { Object } opts 
 * @param { string } opts.ip 
 * @param { number} opts.port
 * @param { string} opts.rs
 */

interface IScannerConstructor {
	ip: string;
	version?: number;
	rs?: string;
	port?: number;
}
class Scanner {
	private ip: string;
	private version: number = 2.1;
	private rs: string = 'eSCL';
	private prototype = 'http://'
	private port: number = 8080

	constructor(opts: IScannerConstructor) {
		this.ip = opts.ip;
		this.port = opts.port || 8080;
		this.version = opts.version || 2.0;
		this.rs = opts.rs || 'eSCL'
	}

	private execute<T>(path: string, opts?: any): Promise<T> {
		let params = { url: '' }
		if (opts) {
			params = { ...opts }
		}

		params.url = `${this.prototype}${this.ip}:${this.port}/${this.rs}/${path}`
		return request(params)
	}

	async ScannerCapabilities(): Promise<ICapabilitiesCallback> {
		let data = {
			method: 'GET'
		}
		try {
			let res: ICapabilities = await this.execute('ScannerCapabilities', data)
			return {
				capabilities: res,
				scansetting: getScanSettingConfig(res),
				BrightnessSupport: getScannerBrightness(res)
			}
		} catch (error) {
			throw error
		}

	}


	async ScanJobs(params: IScanSettingParams): Promise<string> {
		let data = {
			method: 'POST',
			timeout: 30000,
			data: getScanSetting({ ...params, Version: this.version })
		}
		let res: any = await this.execute('ScanJobs', data)
		return res.headers.location
	}

	async ScannerStatus(): Promise<Record<string, any>> {
		try {
			let res: Record<string, any> = await this.execute('ScannerStatus')
			return res['scan:ScannerStatus']
		} catch (error) {
			throw error
		}
	}

	NextDocument(jobId: string, deadline?: number): Promise<any> {
		// Each NextDocument request gets its own hard timeout so a hung/offline
		// device cannot keep the socket open indefinitely.
		return this.execute(`ScanJobs/${jobId}/NextDocument`, { responseType: 'arraybuffer', timeout: 35000 }).then(res => {
			return res
		}, err => {
			if (err.response && err.response.status === 503) {
				// 503 = scanner still busy. Keep polling, but stop once the
				// overall deadline passes (device never delivered a page).
				if (deadline && Date.now() > deadline) {
					return Promise.reject(Object.assign(new Error('Scan timed out — scanner did not respond.'), { scannerOffline: true }));
				}
				return new Promise(resolve => setTimeout(resolve, 2000))
					.then(_ => this.NextDocument(jobId, deadline));
			}
			return Promise.reject(err);
		})
	}

	ScanImageInfo(jobId: string): Promise<any> {
		return this.execute(`ScanJobs/${jobId}/ScanImageInfo`).then(res => {
			return res
		})
	}
}


export default Scanner;
