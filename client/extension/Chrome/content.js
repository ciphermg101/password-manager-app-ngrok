// Initialize the content script when the page is loaded
window.addEventListener('load', () => {
  initializeContentScript();
});

// Show autofill icon when a form or input field is focused
function showAutoFillIcon(target) {
  // Check if the icon already exists and remove it to prevent duplicates
  let existingIcon = document.getElementById('autoFillIcon');
  if (existingIcon) {
    existingIcon.remove();
  }

  // Create a new icon div
  const icon = document.createElement('div');
  icon.id = 'autoFillIcon';

  // Use a custom image for the autofill icon
  const img = document.createElement('img');
  img.src = 'https://lh3.googleusercontent.com/a/ACg8ocL_BptfodwWcfiplF1TsVi9kgWKN6taqaWpApw5VYPIeG4Earg=s288-c-no';
  img.alt = 'icon';
  img.style.width = '48px';
  img.style.height = '48px';
  img.style.pointerEvents = 'none';
  icon.appendChild(img);

  // Function to update icon position based on target field
  function positionIcon() {
    const targetRect = target.getBoundingClientRect();
    icon.style.position = 'absolute';
    icon.style.top = `${window.scrollY + targetRect.top + targetRect.height / 2 - 24}px`; // Center vertically
    icon.style.left = `${window.scrollX + targetRect.left + targetRect.width + 10}px`; // Position right
  
    // Ensure icon stays within viewport
    const iconRect = icon.getBoundingClientRect();
    if (iconRect.right > window.innerWidth) {
      icon.style.left = `${window.innerWidth - iconRect.width - 10}px`;
    }
    if (iconRect.bottom > window.innerHeight) {
      icon.style.top = `${window.innerHeight - iconRect.height - 10}px`;
    }
  }  

  positionIcon();

  // Update icon position on window resize or scroll
  window.addEventListener('resize', positionIcon);
  window.addEventListener('scroll', positionIcon);

  // Style the icon container with animations
  icon.style.cursor = 'pointer';
  icon.style.zIndex = '9999';
  icon.style.transition = 'transform 0.3s ease-in-out, opacity 0.3s ease-in-out'; // Smooth transition effects

  // Append the icon to the body
  document.body.appendChild(icon);

  icon.addEventListener('click', () => {
    // initiates the fetch and open popup action
    chrome.runtime.sendMessage({ action: 'fetchAndOpenPopup' }, (response) => {
      if (!response.success) {
        console.error('Error:', response.error);
      }
    });
  });  

  // Cleanup function to remove event listeners
  function cleanupIcon() {
    icon.remove();
    window.removeEventListener('resize', positionIcon);
    window.removeEventListener('scroll', positionIcon);
  }

  // Remove the icon when the mouse leaves both the target field and the icon
  const removeIconOnHover = (event) => {
    if (!target.contains(event.target) && !icon.contains(event.target)) {
      cleanupIcon();
      icon.remove(); // Remove the icon when user hovers away
      target.removeEventListener('mouseleave', removeIconOnHover); // Cleanup hover listener
      icon.removeEventListener('mouseleave', removeIconOnHover); // Cleanup hover listener
    }
  };

  // Add hover event listeners to both the target and the icon
  target.addEventListener('mouseenter', positionIcon);
  target.addEventListener('mouseleave', removeIconOnHover);
  icon.addEventListener('mouseleave', removeIconOnHover);
}

// Initialize content script
function initializeContentScript() {
  document.addEventListener(
    'focus',
    (event) => {
      const target = event.target;
      
      // Check if the focused target is a relevant field
      if (
        target.matches(
          'input[type="email" i], input[type="password" i], input[name*="user" i], input[name*="email" i], input[name*="password" i], input[placeholder*="user" i], input[placeholder*="email" i], input[placeholder*="password" i]'
        )
      ) {
        showAutoFillIcon(target);
      }

      // Special check for text fields near password fields
      if (target.type === 'text') {
        const passwordField = target.closest('form').querySelector('input[type="password" i]');
        if (passwordField) {
          showAutoFillIcon(target);
        }
      }
    },
    true
  );
}

// Show credential selection dropdown
function showCredentialSelection(credentials, fields) {
  const existingDropdown = document.getElementById('credentialDropdown');
  if (existingDropdown) {
    existingDropdown.remove();
  }

  const dropdown = document.createElement('select');
  dropdown.id = 'credentialDropdown';
  dropdown.style.position = 'absolute';
  dropdown.style.zIndex = '9999';

  const rect = fields.username?.getBoundingClientRect() || fields.password?.getBoundingClientRect();
  if (rect) {
    dropdown.style.top = `${window.scrollY + rect.bottom + 5}px`;
    dropdown.style.left = `${window.scrollX + rect.left}px`;
  }

  credentials.forEach((credential, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.textContent = `${credential.username || 'Unknown User'} (${new URL(credential.site_url).hostname || 'No site name'})`;
    dropdown.appendChild(option);
  });

  dropdown.addEventListener('change', () => {
    const selectedCredential = credentials[dropdown.value];
    if (selectedCredential) {
      autofillCredentials(fields, selectedCredential);
    }
    dropdown.remove();
  });

  document.body.appendChild(dropdown);

  dropdown.addEventListener('blur', () => dropdown.remove());
}

// Detect login fields dynamically
function detectLoginFields() {
  // Detect password fields
  const passwordField = document.querySelector(
    'input[type="password" i], input[name*="password" i], input[placeholder*="password" i]'
  );

  // Detect username fields explicitly
  let usernameField = document.querySelector(
    'input[type="email" i], input[type="text" i], input[name*="user" i], input[name*="email" i], input[placeholder*="user" i], input[placeholder*="email" i]'
  );

  // If usernameField or passwordField is missing, log an error
  if (!usernameField || !passwordField) {
    console.error('Failed to detect login fields');
    return null;
  }

  // Return selectors for the detected fields
  return {
    usernameSelector: getElementSelector(usernameField),
    passwordSelector: getElementSelector(passwordField),
  };
}

// Helper to get a unique selector for an element
function getElementSelector(element) {
  return element.id ? `#${element.id}` : element.name ? `[name="${element.name}"]` : element.tagName.toLowerCase();
}

// Autofill credentials into the detected fields
function autofillCredentials({ username, password }) {
  const fields = detectLoginFields();

  if (fields) {
    const { usernameSelector, passwordSelector } = fields;

    // Find the username and password input fields using the provided selectors
    const usernameField = document.querySelector(usernameSelector);
    const passwordField = document.querySelector(passwordSelector);

    // Check if usernameField exists and autofill
    if (usernameField) {
      usernameField.value = username;
      usernameField.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      console.error('Username field not found for autofill');
    }

    // Check if passwordField exists and autofill
    if (passwordField) {
      passwordField.value = password;
      passwordField.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      console.error('Password field not found for autofill');
    }
  } else {
    console.error('Failed to autofill credentials: No login fields detected');
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'autofillCredentials') {
    try {
      autofillCredentials(message.credential);
      sendResponse({ success: true });  // Send success response after autofill
    } catch (error) {
      console.error('Error autofilling credentials:', error);
      sendResponse({ success: false, error: error.message || 'Failed to autofill credentials' });
    }
  } else {
    sendResponse({ success: false, error: 'Unknown action' });
  }

  return true;  // Keep the message channel open for response
});

document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('submit', async (event) => {
    const form = event.target;

    // Use detectLoginFields to find fields within the form
    const fields = detectLoginFields();

    if (fields) {
      const { usernameSelector, passwordSelector } = fields;

      // Find the fields in the current form
      const usernameField = form.querySelector(usernameSelector);
      const passwordField = form.querySelector(passwordSelector);

      if (usernameField && passwordField) {
        const username = usernameField.value || '';
        const password = passwordField.value;

        if (username && password) {
          const siteUrl = window.location.href;

          // Send the credentials to the background script
          chrome.runtime.sendMessage(
            {
              action: 'saveCredentials',
              credentials: { site_url: siteUrl, username, password },
            },
            (response) => {
              if (response.success) {
                console.log('Credentials sent to the backend successfully.');
              } else {
                console.error('Failed to send credentials to the backend:', response.error);
              }
            }
          );
        }
      } else {
        console.error('Username or password field not found in the form');
      }
    } else {
      console.error('Failed to detect login fields');
    }
  }, true);
});

