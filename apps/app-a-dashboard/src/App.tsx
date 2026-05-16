import { useEffect, useRef } from 'react';
import { ShellClient } from '@plataforma/shell-protocol';
import Dashboard from './Dashboard';

function App() {
  const clientRef = useRef<ShellClient | null>(null);

  useEffect(() => {
    const client = new ShellClient('dashboard');
    clientRef.current = client;

    client.onToken = (token, user) => {
      console.log('Dashboard: auth received', user.name);
    };

    client.onTheme = (mode) => {
      document.documentElement.setAttribute('data-theme', mode);
    };

    // Report height periodically (for iframe resize)
    const reportHeight = () => {
      client.reportHeight(document.documentElement.scrollHeight);
    };
    reportHeight();
    const observer = new ResizeObserver(reportHeight);
    observer.observe(document.body);

    const interval = setInterval(reportHeight, 1000);

    return () => {
      client.destroy();
      observer.disconnect();
      clearInterval(interval);
    };
  }, []);

  return <Dashboard />;
}

export default App;
