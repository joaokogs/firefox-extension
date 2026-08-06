import { render } from 'preact';
import { App } from './App';
import { mountSolidToast } from './solidToast';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './styles/index.css';

const root = document.getElementById('root');
if (root) {
  mountSolidToast();
  render(<App />, root);
}
