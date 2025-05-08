(async () => {
  const { blobUrl: url } = (await chrome.storage.local.get('blobUrl')) ?? {};
  console.log('onload', url);
  const el = document.getElementById('video-preview');
  el.src = url;
  el.load();
  chrome.storage.local.set({ blobUrl: '' });
})();
