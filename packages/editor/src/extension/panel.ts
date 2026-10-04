import { createApp } from 'vue';
import App from './App.vue';
import './style.css';
document.documentElement.dataset.theme = chrome.devtools.panels.themeName === 'default' ? 'light' : 'dark';
createApp(App).mount('#app');
