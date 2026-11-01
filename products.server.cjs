const PRODUCTS = [
  { id: 'stealthwriter-pro', name: 'Stealthwriter Plus Plan', price: 1500 },
  { id: 'stealthwriter-starter', name: 'Stealthwriter Starter Plan', price: 1000 },
  { id: 'ryne-ai', name: 'Ryne AI', price: 1000 },
  { id: 'ai-removal-per-page', name: 'AI Removal Per Page', price: 50 },

  { id: 'chatgpt5-teams', name: 'ChatGPT 5 Teams Plan', price: 800 },
  { id: 'claudie-ai-pro', name: 'Claudie AI Pro', price: 1000 },
  { id: 'deepseek', name: 'DeepSeek', price: 1000 },
  { id: 'supergrok', name: 'SuperGrok Premium', price: 1000 },

  { id: 'turnitin-reports', name: 'Turnitin Reports', price: 130 },
  { id: 'turnitin-slots-1', name: 'Turnitin Slots (1)', price: 140 },
  { id: 'gptzero-ai-reports', name: 'GPTZero AI Reports', price: 40 },
  { id: 'quillbot-premium', name: 'Quillbot Premium', price: 200 },
  { id: 'grammarly-premium', name: 'Grammarly Premium', price: 150 },

  { id: 'article-unlocks', name: 'Article Unlocks', price: 50 },
  { id: 'ebooks', name: 'Ebooks', price: 100 },
  { id: 'coursehero', name: 'Coursehero', price: 40 },
  { id: 'chegg', name: 'Chegg', price: 40 },
  { id: 'studypool', name: 'Studypool', price: 50 },
  { id: 'cliffnotes', name: 'Cliffnotes', price: 50 },
  { id: 'studocu', name: 'Studocu', price: 50 },

  { id: 'expressvpn', name: 'Express VPN', price: 400 },
  { id: 'nordvpn', name: 'Nord VPN', price: 400 },
  { id: 'windscribe', name: 'Windscribe VPN', price: 400 },
  { id: 'static-residential-proxy', name: 'Static Residential Proxy', price: 1000 },
  { id: 'us-numbers', name: 'US Numbers', price: 2000 },

  { id: 'netflix', name: 'Netflix Premium', price: 400 },
  { id: 'dstv', name: 'DSTV Premium', price: 2000 },

  { id: 'training', name: 'Academic Writing Training', price: 2500 },
]

function findProductById(productId) {
  return PRODUCTS.find(p => p.id === productId) || null
}

module.exports = { PRODUCTS, findProductById }
