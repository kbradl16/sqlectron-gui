import axios from 'axios';
import packageJSON from '../../package.json';


const debug = require('./debug')('gh-update-checker');
const WAIT_2_SECS = 2000;


export async function check(mainWindow) {
  const currentVersion = `v${packageJSON.version}`;
  debug('current version %s', currentVersion);

  const repo = packageJSON.repository.url.replace('https://github.com/', '');
  const latestReleaseURL = `https://api.github.com/repos/${repo}/releases/latest`;
  const response = await axios.get(latestReleaseURL);

  debug('latest version %s', response.data.tag_name);
  if (currentVersion === response.data.tag_name) {
    debug('already using the latest version');
    return;
  }

  // give some time to the render process be ready
  setTimeout(
    () => mainWindow.webContents.send('sqlectron:update-available'),
    WAIT_2_SECS
  );
}
