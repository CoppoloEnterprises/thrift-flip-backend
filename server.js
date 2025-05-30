const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Enable CORS
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Set up file upload handling
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Global variable to store access token
let ebayAccessToken = null;
let tokenExpiration = null;

// Get OAuth access token for eBay Browse API
async function getEbayAccessToken() {
  try {
    // Check if we have a valid token
    if (ebayAccessToken && tokenExpiration && new Date() < tokenExpiration) {
      return ebayAccessToken;
    }

    console.log('🔑 Getting new eBay OAuth token...');

    // Create credentials for OAuth
    const credentials = Buffer.from(`${process.env.EBAY_APP_ID}:${process.env.EBAY_CERT_ID}`).toString('base64');

    const response = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`
      },
      body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope'
    });

    const data = await response.json();

    if (data.access_token) {
      ebayAccessToken = data.access_token;
      // Set expiration to 5 minutes before actual expiration
      tokenExpiration = new Date(Date.now() + (data.expires_in - 300) * 1000);
      console.log('✅ eBay OAuth token obtained successfully');
      return ebayAccessToken;
    } else {
      console.error('❌ Failed to get eBay token:', data);
      throw new Error('Failed to get eBay access token');
    }

  } catch (error) {
    console.error('❌ Error getting eBay token:', error);
    throw error;
  }
}

// Generate smart search terms for eBay
function generateSearchTerms(itemName) {
  const terms = [];
  const lower = itemName.toLowerCase();
  
  // Original term
  terms.push(itemName);
  
  // Brand + category combinations
  if (lower.includes('wilson') && lower.includes('football')) {
    terms.push('Wilson NFL football');
    terms.push('football Wilson');
  }
  
  if (lower.includes('athletic') && lower.includes('sneakers')) {
    terms.push('nike shoes');
    terms.push('athletic shoes');
  }
  
  if (lower.includes('footjoy') || (lower.includes('golf') && lower.includes('shoes'))) {
    terms.push('Footjoy golf shoes');
    terms.push('golf shoes');
  }
  
  if (lower.includes('baseball') && (lower.includes('cap') || lower.includes('hat'))) {
    terms.push('baseball cap');
    terms.push('MLB cap');
  }
  
  if (lower.includes('titleist')) {
    terms.push('Titleist golf hat');
    terms.push('golf cap');
  }
  
  // Generic fallbacks
  if (lower.includes('football')) {
    terms.push('NFL football');
  }
  
  if (lower.includes('hat') || lower.includes('cap')) {
    terms.push('baseball cap');
  }
  
  if (lower.includes('shoes') || lower.includes('sneakers')) {
    terms.push('athletic shoes');
  }
  
  // Return only first 3 terms to avoid rate limiting
  return [...new Set(terms)].slice(0, 3);
}

// Search eBay using Browse API
async function searchEbayBrowseAPI(searchTerm, accessToken) {
  try {
    const encodedTerm = encodeURIComponent(searchTerm);
    
    // eBay Browse API endpoint
    const url = `https://api.ebay.com/buy/browse/v1/item_search?` +
      `q=${encodedTerm}&` +
      `limit=50&` +
      `filter=conditionIds:{1000|1500|2000|2500|3000}&` +
      `filter=deliveryCountry:US&` +
      `filter=priceCurrency:USD&` +
      `sort=newlyListed`;

    console.log('🔍 eBay Browse API search:', searchTerm);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
      }
    });

    const data = await response.json();

    if (data.itemSummaries && data.itemSummaries.length > 0) {
      console.log('✅ Found', data.itemSummaries.length, 'items with Browse API');
      
      return data.itemSummaries.map(item => ({
        title: item.title,
        price: parseFloat(item.price.value),
        currency: item.price.currency,
        condition: item.condition,
        itemUrl: item.itemWebUrl,
        imageUrl: item.image?.imageUrl,
        seller: item.seller?.username
      })).filter(item => item.price > 0 && item.price < 2000);
    }

    return [];

  } catch (error) {
    console.error('Error searching eBay Browse API:', error);
    return [];
  }
}

// Get eBay market data using Browse API
async function getEbayMarketData(itemName) {
  try {
    console.log('🛒 Fetching eBay Browse API data for:', itemName);
    
    // Get access token
    const accessToken = await getEbayAccessToken();
    
    // Try different search terms
    const searchTerms = generateSearchTerms(itemName);
    let allItems = [];
    
    for (const searchTerm of searchTerms) {
      const items = await searchEbayBrowseAPI(searchTerm, accessToken);
      if (items.length > 0) {
        allItems = items;
        console.log('✅ Found', items.length, 'items with term:', searchTerm);
        break; // Use first successful search
      }
    }
    
    if (allItems.length === 0) {
      console.log('⚠️ No items found, using fallback data');
      return getFallbackMarketData(itemName);
    }
    
    // Calculate market metrics from eBay Browse API data
    const prices = allItems.map(item => item.price);
    const avgSoldPrice = Math.round(prices.reduce((sum, price) => sum + price, 0) / prices.length);
    
    // Estimate sell-through rate based on number of listings
    // More listings usually means lower sell-through rate
    let sellThroughRate = 70;
    if (allItems.length > 100) sellThroughRate = 40;
    else if (allItems.length > 50) sellThroughRate = 55;
    else if (allItems.length > 20) sellThroughRate = 65;
    
    // Estimate listing time based on market activity
    const avgListingTime = allItems.length > 50 ? 21 : allItems.length > 20 ? 14 : 10;
    
    // Determine demand level
    let demandLevel = 'High';
    if (sellThroughRate < 45) demandLevel = 'Low';
    else if (sellThroughRate < 60) demandLevel = 'Medium';
    
    const marketData = {
      avgSoldPrice,
      sellThroughRate,
      avgListingTime,
      demandLevel,
      seasonality: 'Year-round',
      dataSource: 'eBay Browse API',
      activeListingsCount: allItems.length,
      samplePrice: prices.slice(0, 5) // Show first 5 prices for reference
    };
    
    console.log('✅ eBay Browse API data calculated:', marketData);
    return marketData;
    
  } catch (error) {
    console.error('❌ eBay Browse API error:', error.message);
    return getFallbackMarketData(itemName);
  }
}

function getFallbackMarketData(itemName) {
  const categoryLower = itemName.toLowerCase();
  
  if (categoryLower.includes('wilson') && categoryLower.includes('football')) {
    return { avgSoldPrice: 28, sellThroughRate: 65, avgListingTime: 10, demandLevel: "High", seasonality: "Fall peak", dataSource: 'Estimate' };
  }
  if (categoryLower.includes('footjoy') || (categoryLower.includes('golf') && categoryLower.includes('shoes'))) {
    return { avgSoldPrice: 45, sellThroughRate: 60, avgListingTime: 12, demandLevel: "Medium", seasonality: "Year-round", dataSource: 'Estimate' };
  }
  if (categoryLower.includes('athletic') && categoryLower.includes('sneakers')) {
    return { avgSoldPrice: 65, sellThroughRate: 70, avgListingTime: 8, demandLevel: "High", seasonality: "Year-round", dataSource: 'Estimate' };
  }
  if (categoryLower.includes('baseball') && (categoryLower.includes('cap') || categoryLower.includes('hat'))) {
    return { avgSoldPrice: 22, sellThroughRate: 55, avgListingTime: 14, demandLevel: "Medium", seasonality: "Year-round", dataSource: 'Estimate' };
  }
  
  return { 
    avgSoldPrice: 35, 
    sellThroughRate: 50, 
    avgListingTime: 15, 
    demandLevel: "Medium", 
    seasonality: "Year-round",
    dataSource: 'Estimate'
  };
}

// Debug endpoint for Browse API
app.get('/api/debug-browse/:searchTerm', async (req, res) => {
  try {
    const searchTerm = req.params.searchTerm;
    console.log('🔧 Debug: Testing eBay Browse API with term:', searchTerm);
    
    const accessToken = await getEbayAccessToken();
    const results = await searchEbayBrowseAPI(searchTerm, accessToken);
    
    res.json({
      searchTerm,
      accessToken: accessToken ? 'Token obtained' : 'No token',
      resultCount: results.length,
      sampleResults: results.slice(0, 3)
    });
    
  } catch (error) {
    console.error('🔧 Debug Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Image analysis endpoint
app.post('/api/analyze-image', upload.single('image'), async (req, res) => {
  try {
    console.log('📸 Received image for analysis');
    
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const base64Image = req.file.buffer.toString('base64');
    console.log('🔄 Converting image and calling Google Vision API...');

    const visionRequest = {
      requests: [
        {
          image: {
            content: base64Image
          },
          features: [
            { type: 'OBJECT_LOCALIZATION', maxResults: 10 },
            { type: 'LABEL_DETECTION', maxResults: 10 },
            { type: 'TEXT_DETECTION', maxResults: 10 },
            { type: 'LOGO_DETECTION', maxResults: 10 }
          ]
        }
      ]
    };

    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_VISION_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(visionRequest)
      }
    );

    const data = await response.json();
    
    if (data.error) {
      console.error('❌ Google Vision API error:', data.error.message);
      return res.status(400).json({ error: data.error.message });
    }

    const annotations = data.responses[0];
    const objects = annotations.localizedObjectAnnotations || [];
    const labels = annotations.labelAnnotations || [];
    const text = annotations.textAnnotations || [];
    const logos = annotations.logoAnnotations || [];

    console.log('🔍 Google Vision detected:');
    console.log('Objects:', objects.map(o => o.name));
    console.log('Labels:', labels.map(l => l.description));
    console.log('Logos:', logos.map(l => l.description));

    const allDetections = [
      ...objects.map(obj => ({ type: 'object', description: obj.name, score: obj.score })),
      ...labels.map(label => ({ type: 'label', description: label.description, score: label.score })),
      ...logos.map(logo => ({ type: 'logo', description: logo.description, score: logo.score }))
    ];

    allDetections.sort((a, b) => b.score - a.score);

    const category = categorizeItem(allDetections, text);
    const confidence = Math.round((allDetections[0]?.score || 0) * 100);

    console.log('✅ Final result:', category, `(${confidence}% confidence)`);

    // Get eBay market data using Browse API
    const marketData = await getEbayMarketData(category);

    res.json({
      category,
      confidence,
      detections: allDetections,
      brands: logos.map(logo => logo.description),
      text: text.map(t => t.description).join(' '),
      ...marketData
    });

  } catch (error) {
    console.error('❌ Error analyzing image:', error);
    res.status(500).json({ error: 'Failed to analyze image: ' + error.message });
  }
});

function categorizeItem(detections, textDetections) {
  const keywords = detections.map(d => d.description.toLowerCase()).join(' ');
  const textContent = textDetections.map(t => t.description.toLowerCase()).join(' ');
  const allContent = (keywords + ' ' + textContent).toLowerCase();
  
  console.log('🏷️ Analyzing keywords:', allContent);
  
  const primaryDetection = detections[0]?.description || 'Unknown Item';
  
  // Improved categorization with brand detection
  if ((allContent.includes('football') || allContent.includes('american football')) && allContent.includes('wilson')) {
    return 'Wilson Football';
  }
  if (allContent.includes('football') || allContent.includes('american football')) {
    return 'Football';
  }
  if ((allContent.includes('shoe') || allContent.includes('golf')) && allContent.includes('footjoy')) {
    return 'Footjoy Golf Shoes';
  }
  if (allContent.includes('basketball') && allContent.includes('nike')) {
    return 'Nike Basketball';
  }
  if (allContent.includes('basketball')) {
    return 'Basketball';
  }
  if ((allContent.includes('hat') || allContent.includes('cap')) && allContent.includes('titleist')) {
    return 'Titleist Golf Hat';
  }
  if ((allContent.includes('hat') || allContent.includes('cap')) && allContent.includes('baseball')) {
    return 'Baseball Cap';
  }
  if (allContent.includes('hat') || allContent.includes('cap')) {
    return 'Hat';
  }
  if (allContent.includes('shoe') || allContent.includes('sneaker') || allContent.includes('boot')) {
    return 'Athletic Sneakers';
  }
  
  // Use Google Vision's most confident result
  const capitalizedPrimary = primaryDetection.charAt(0).toUpperCase() + primaryDetection.slice(1);
  return capitalizedPrimary;
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'Server is running!',
    timestamp: new Date().toISOString(),
    ebayIntegration: 'Browse API Active'
  });
});

app.get('/', (req, res) => {
  res.json({ 
    message: 'Thrift Flip Analyzer Backend Server',
    endpoints: {
      health: '/api/health',
      analyze: '/api/analyze-image (POST)',
      debugBrowse: '/api/debug-browse/:searchTerm'
    },
    integrations: {
      googleVision: 'Active',
      ebayBrowseAPI: 'Active'
    }
  });
});

app.listen(PORT, () => {
  console.log('🚀 Thrift Flip Backend Server Started!');
  console.log(`📡 Server running on http://localhost:${PORT}`);
  console.log('🔑 Google Vision API key loaded');
  console.log('🛒 eBay Browse API credentials loaded');
  console.log('📱 Ready to analyze images with real market data!');
});
