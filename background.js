/*
 * background.js runs in the background on Chrome. It has access to manage the windows/tabs.
 * This will start the process to redirect the open tab into the PWA.
 */

chrome.storage.onChanged.addListener(async (changes) => {
  if (changes['blobUrl']?.newValue) {
    chrome.tabs.create({
      url: 'video.html',
    });
  }
});
