/*
 * contentScript.js is injected onto any meet.google.com page. This has different logic depending on if
 * it is running in the PWA or a normal tab. The PWA portion will redirect it to the correct meeting
 * (if not currently on a meeting). The normal tab will replace the content on the original page
 * informing the user they were redirected to the PWA.
 */
let JSZip = window.JSZip;
// import JSZip from 'jszip';
const css = (baseString, ...strings) =>
  baseString.flatMap((segment, i) => [segment, strings[i] ?? '']).join('');

const originalLinkSelector = `a[href*="/artifacts/"]:not(.preview-button,[data-test-selector="download-artifact-button"])`;
const visitedClass = 'preview-attached';
const previewOverlayId = 'artifact-preview';
const loadingSpinnerId = 'loading-spinner';
const blobUrlAttribute = 'data-blobUrl';
const allStyles = css`
  #${previewOverlayId} {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.8);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    z-index: 9998;
    gap: 1em;
    padding: 2em;
    max-height: 100%;
  }

  #${previewOverlayId} img,
  #${previewOverlayId} video {
    max-width: 100%;
    max-height: 100%;
    box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
    border-radius: 1em;
    border: 2px solid rgba(255, 255, 255, 0.1);
    background-color: rgba(255, 255, 255, 0.1);
    flex-grow: 1;
    flex-shrink: 1;
  }

  #${loadingSpinnerId} {
    width: 50px;
    height: 50px;
    border: 5px solid rgba(255, 255, 255, 0.3);
    border-top: 5px solid white;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  .preview-container {
    max-width: 100%;
    min-height: 0;
    flex-grow: 1;
    flex-shrink: 1;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .preview-button {
    background-color: white;
    color: black;
    border: none;
    border-radius: 0.5em;
    padding: 10px 20px;
    text-decoration: none;
  }

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  ${originalLinkSelector}.video-preview {
    color: rgb(255, 235, 87) !important;
  }

  ${originalLinkSelector}.image-preview {
    color: rgb(87, 205, 255) !important;
  }
  ${originalLinkSelector}:not([${blobUrlAttribute}]) {
    opacity: 0.7;
  }
`;

function isGithub() {
  return window.location.href.includes('github.com');
}

const buildPreviewOverlay = (el, src) => {
  // document.body.querySelectorAll(`[${blobUrlAttribute}]`)?.forEach((el) => {
  //   const url = el.getAttribute(blobUrlAttribute);
  //   if (!url.startsWith("data:")) {
  //     URL.revokeObjectURL(url);
  //   }
  // });
  document.body.querySelector(`#${previewOverlayId}`)?.remove();

  const isVideo = el.textContent.includes('.mp4');
  const preview = document.createElement(isVideo ? 'video' : 'img');
  if (isVideo) {
    preview.controls = true;
  }

  const loadingSpinner = document.createElement('div');
  loadingSpinner.id = loadingSpinnerId;

  const previewContainer = document.createElement('div');
  previewContainer.className = 'preview-container';
  previewContainer.appendChild(loadingSpinner);

  const previewOverlay = document.createElement('div');
  previewOverlay.id = previewOverlayId;
  previewOverlay.addEventListener('click', (e) => {
    if (![previewOverlay, previewContainer].includes(e.target)) {
      return;
    }
    previewOverlay.remove();
  });

  const closeButton = document.createElement('button');
  closeButton.innerText = 'Close';
  closeButton.className = 'preview-button';
  closeButton.addEventListener('click', () => {
    previewOverlay.remove();
  });

  const downloadButton = document.createElement('a');
  downloadButton.href = src;
  downloadButton.download = src.split('/').pop();
  downloadButton.innerText = 'Download';
  downloadButton.className = 'preview-button';

  previewOverlay.appendChild(previewContainer);
  previewOverlay.appendChild(closeButton);
  previewOverlay.appendChild(downloadButton);
  return {
    previewOverlay,
    onUrlReady: (url) => {
      preview.src = url;
      el.setAttribute(blobUrlAttribute, url);

      if (isVideo) {
        chrome.storage.local.set({
          blobUrl: url,
        });
        previewOverlay.remove();
      } else {
        previewContainer.removeChild(loadingSpinner);
        previewContainer.appendChild(preview);
      }
    },
  };
};

const attachPreviewElement = (el, src) => {
  const isVideo = el.textContent.includes('.mp4');
  el.classList.add(visitedClass);
  el.classList.add(isVideo ? 'video-preview' : 'image-preview');
  el.addEventListener('click', async (e) => {
    // move below to fail gracefully
    e.preventDefault();
    e.stopPropagation();
    const { previewOverlay, onUrlReady } = buildPreviewOverlay(el, src);

    document.body.appendChild(previewOverlay);
    const blobUrl = el.getAttribute(blobUrlAttribute) || (await getBlobUrl(src, isVideo));
    console.log('attached preview', el.textContent, el.href, blobUrl);
    onUrlReady(blobUrl);
    //   e.preventDefault();
    //   e.stopPropagation();
  });
};

async function getBlobUrl(href, isVideo) {
  const file = await fetch(href, {
    headers: {
      'Turbo-Visit': true,
    },
  });
  const buffer = await file.arrayBuffer();
  // console.log({ file });

  const zip = await JSZip.loadAsync(buffer);
  // console.log('zip', zip);
  const fileName = Object.keys(zip.files).filter((name) => ['.mp4', '.png'].some((ext) => name))[0];
  // if (!isVideo) {
  const blob = await zip.file(fileName).async('blob');
  const blobUrl = URL.createObjectURL(blob);
  console.log({ blobUrl });
  return blobUrl;
  // } else {
  //   const base64 = await zip.file(fileName).async('base64');
  //   return `data:video/mp4;base64,${base64}`;
  // }
}

const attachPreviews = () => {
  const links = document.body.querySelectorAll(`${originalLinkSelector}:not(.${visitedClass})`);
  console.log(`Found ${links.length} links to update:`, [
    ...new Set([...links].map(({ textContent }) => textContent?.trim())),
  ]);
  links.forEach(async (el) => {
    await attachPreviewElement(el, el.href);
  });
};

(async () => {
  // JSZip = await import('./node_modules/jszip/dist/jszip.js');

  if (isGithub()) {
    // Add a <style> element to the document head
    const style = document.createElement('style');

    style.textContent = allStyles;
    document.head.appendChild(style);

    setInterval(attachPreviews, 10000);
    attachPreviews();
  } else {
    // do nothing rn
    // Normal tab, add listener to replace UI with
    chrome.storage.onChanged.addListener(function (changes) {
      if (changes['originatingTabId'] && changes['originatingTabId'].newValue) {
        document.body.appendChild(buildNotificationElements());
      }
      if (changes['googleMeetDeclinedUrl'] && document.getElementById(OVERLAY_ID)) {
        document.getElementById(OVERLAY_ID).remove();
      }
    });
  }
})();
