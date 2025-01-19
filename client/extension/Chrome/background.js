// Base URL for API requests
const baseURL = 'http://localhost:3000/';
const getFullUrl = (path) => new URL(path, baseURL).href;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'log':
      handleLogAction(sendResponse);
      break;

    case 'debug':
      handleDebugAction(message, sendResponse);
      break;

    case 'fetchAndOpenPopup':
      handleFetchAndOpenPopup(sendResponse);
      break;

    case 'autofillCredentials':
      handleAutofillCredentials(message, sendResponse);
      break;

    case 'showCredentialSelection':
      handleShowCredentialSelection(message, sendResponse);
      break;

    case 'storeTokens':
      handleStoreTokens(message.tokens, sendResponse);
      break;

    case 'saveCredentials':
      handleSaveCredentials(message, sendResponse);
      break;

    default:
      sendResponse({ success: false, error: 'Unknown action' });
      break;
  }
  return true; // Keep the message channel open for async response
});

// Handle 'log' action
function handleLogAction(sendResponse) {
  sendResponse({ success: true, message: 'Logged successfully.' });
}

// Handle 'debug' action
function handleDebugAction(message, sendResponse) {
  console.debug(message.data || 'Debugging information unavailable');
  sendResponse({ success: true, message: 'Debugging complete.' });
}

// Handle 'fetchAndOpenPopup' action
function handleFetchAndOpenPopup(sendResponse) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      const siteUrl = tabs[0].url;
      const tabId = tabs[0].id;

      // Store both siteUrl and tabId in chrome.storage.local
      chrome.storage.local.set({ siteUrl, tabId }, () => {

        // Open the popup after storing the site URL and tab ID
        chrome.windows.create({
          url: chrome.runtime.getURL('popup.html'),
          type: 'popup',
          width: 360,
          height: 360,
        });

        sendResponse({ success: true, message: 'Popup opened with site URL and tab ID stored.' });
      });
    } else {
      sendResponse({ success: false, error: 'No active tab found.' });
    }
  });
  return true; // Keep the channel open for async response
}

// Handle 'showCredentialSelection' action
function handleShowCredentialSelection(message, sendResponse) {
  if (Array.isArray(message.credentials) && message.fields) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'showCredentialSelection', credentials: message.credentials, fields: message.fields }, (response) => {
        if (response && response.success) {
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'Failed to show credential selection' });
        }
      });
    });
  } else {
    sendResponse({ success: false, error: 'Invalid credentials or fields' });
  }
  return true; // Keep the message channel open
}

// Handle 'autofillCredentials' action
function handleAutofillCredentials(message, sendResponse) {
  const { username, password } = message.credential;
  
  // Retrieve the stored tabId from chrome.storage.local
  chrome.storage.local.get(['tabId'], (result) => {
    const tabId = result.tabId;

    if (tabId) {
      // Send message to content script to autofill credentials for the stored tab ID
      chrome.tabs.sendMessage(
        tabId,
        {
          action: 'autofillCredentials',
          credential: { username, password },
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error('Error sending message to content script:', chrome.runtime.lastError);
            sendResponse({ success: false, error: 'Error sending message to content script' });
            return;
          }

          if (response && response.success) {
            sendResponse({ success: true });
          } else {
            console.error('Failed to autofill credentials in content script.');
            sendResponse({ success: false, error: 'Failed to autofill credentials' });
          }
        }
      );
    } else {
      console.error('No stored tab ID found in chrome storage.');
      sendResponse({ success: false, error: 'No stored tab ID found' });
    }
  });

  return true; // Keep the message channel open for async response
}

// Handle 'storeTokens' action
function handleStoreTokens(tokens, sendResponse) {
  const { csrfToken, accessToken } = tokens;

  if (!csrfToken || !accessToken) {
    sendResponse({ success: false, error: 'Invalid tokens provided' });
    return;
  }

  chrome.storage.local.set({ csrfToken, accessToken }, () => {
    console.log('Tokens stored successfully in chrome.storage.local');
    sendResponse({ success: true });
  });

  return true; // Keep the message channel open
}

// Handle 'saveCredentials' action
function handleSaveCredentialsWithPrompt(message, sendResponse) {
  const { site_url, username, password } = message.credentials;

  chrome.notifications.create(
    {
      type: 'basic',
      iconUrl: '/icons/icon16.png',
      title: 'Save Credentials?',
      message: `Save your login details for ${new URL(site_url).hostname}?`,
      buttons: [{ title: 'Save' }, { title: 'Cancel' }],
      requireInteraction: true,
    },
    (notificationId) => {
      chrome.notifications.onButtonClicked.addListener((notifId, btnIdx) => {
        if (notifId === notificationId) {
          if (btnIdx === 0) {
            // User clicked "Save" - Proceed with backend save
            chrome.storage.local.get(['csrfToken', 'accessToken'], async (result) => {
              const csrfToken = result.csrfToken;
              const accessToken = result.accessToken;

              if (!csrfToken || !accessToken) {
                sendResponse({ success: false, error: 'Authentication tokens missing' });
                return;
              }

              try {
                const response = await fetch(getFullUrl('/account/save-password'), {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`,
                    'X-CSRF-Token': csrfToken,
                  },
                  body: JSON.stringify({ site_url, username, password }),
                });

                if (response.ok) {
                  sendResponse({ success: true });
                } else {
                  const data = await response.json();
                  sendResponse({ success: false, error: data.message || 'Failed to save credentials' });
                }
              } catch (error) {
                console.error('Error sending credentials to backend:', error);
                sendResponse({ success: false, error: 'Error connecting to the backend' });
              }
            });
          } else {
            // User clicked "Cancel"
            sendResponse({ success: false, error: 'User declined to save credentials' });
          }
        }
      });
    }
  );
}

