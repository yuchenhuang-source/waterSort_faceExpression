import React from 'react';
import ReactDOM from 'react-dom/client';

async function bootstrap() {
  const App = (await import('./App')).default;
  const { DeviceSimulator } = await import('./components/DeviceSimulator');

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <DeviceSimulator>
        <App />
      </DeviceSimulator>
    </React.StrictMode>,
  );
}

bootstrap();
