import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function Layout() {
  return (
    <div className="h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="mr-72 flex h-screen flex-col">
        <TopBar />
        <main className="flex-1 min-h-0 overflow-hidden px-8 py-6 animate-fade-in">
          <div className="h-full overflow-y-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
