import { render } from 'preact';
import { Popup } from './Popup';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './styles/popup.css';

const root = document.getElementById('root');
if (root) {
  render(<Popup />, root);
}
