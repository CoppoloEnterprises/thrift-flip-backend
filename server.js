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

// Generate smart search terms for eBay
function generateSearchTerms(itemName) {
  const terms = [];
  const lower = itemName.toLowerCase();
  
  // Original term
  terms.push(itemName);
  
  // Brand + category combinations
  if (lower.includes('wilson') && lower.includes('football')) {
    terms.push('Wilson NFL football');
    terms.push('Wilson football official');
    terms.push('Wilson composite football');
    terms.push('football Wilson');
    terms.push('NFL football');
    terms.push('football official size');
  }
  
  if (lower.includes('baseball') && lower.includes('equipment')) {
    terms.push('baseball cap');
    terms.push('baseball hat');
    terms.push('MLB cap');
    terms.push('sports cap');
  }
  
  if (lower.includes('baseball') && lower.includes('cap')) {
    terms.push('baseball cap');
    terms.push('MLB cap');
    terms.push('fitted cap');
    terms.push('snapback cap');
  }
  
  if (lower.includes('hat') && !lower.includes('baseball')) {
    terms.push('baseball cap');
    terms.push('sports hat');
    terms.push('fitted hat');
  }
  
  if (lower.includes('titleist')) {
    terms.push('Titleist golf hat');
    terms.push('Titleist cap');
    terms.push('golf cap');
    terms.push('golf hat');
  }
  
  // Generic category fallbacks
  if (lower.includes('football')) {
    terms.push('NFL football');
    terms.push('football official');
    terms.push('composite football');
    terms.push('football leather');
  }
  
  if (lower.includes('basketball')) {
    terms.push('basketball official');
    terms.push('NBA basketball');
    terms.push('basketball spalding');
  }
  
  if (lower.includes('sneakers') || lower.includes('shoes')) {
    terms.push('athletic shoes');
    terms.push('running shoes');
    terms.push('basketball shoes');
  }
  
  if (lower.includes('electronics')) {
    terms.push('vintage electronics');
    terms.push('electronic device');
  }
  
  // Remove duplicates and return
  return [...new Set(terms)];
}

// Perform actual eBay search
async function performEbaySearch(searchTerm) {
  try {
    const encodedTerm = encodeURIComponent(searchTerm);
    
    // eBay Finding API - findCompletedItems
    const url = `https://svcs.ebay.com/services/search/FindingService/v1?` +
      `OPERATION-NAME=findCompletedItems&` +
      `SERVICE-VERSION=1.13.0&` +
      `SECURITY-APPNAME=${process.env.EBAY_APP_ID}&` +
      `RESPONSE-DATA-FORMAT=JSON&` +
      `keywords=${encodedTerm}&` +
      `itemFilter(0).name=SoldItemsOnly&` +
      `itemFilter(0).value=true&` +
      `itemFilter(1).name=ListingType&` +
      `itemFilter(1).value(0)=AuctionWithBIN&` +
      `itemFilter(1).value(1)=FixedPrice&` +
      `itemFilter(2).name=MinPrice&` +
      `itemFilter(2).value=1&` +
      `itemFilter(2).paramName=Currency&` +
      `itemFilter(2).paramValue=USD&` +
      `sortOrder=EndTimeSoonest&` +
      `paginationInput.entriesPerPage=50`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (!data.findCompletedItemsResponse || 
        !data.findCompletedItemsResponse[0].searchResult ||
        !data.findCompletedItemsResponse[0].searchResult[0].item) {
      return [];
    }
    
    const items = data.findCompletedItemsResponse[0].searchResult[0].item;
    
    return items.map(item => {
      const endTime = new Date(item.listingInfo[0].endTime[0]);
      const startTime = new Date(item.listingInfo[0].startTime[0]);
      const listingDays = Math.ceil((endTime - startTime) / (1000 * 60 * 60 * 24));
      
      return {
        title: item.title[0],
        price: parseFloat(item.sellingStatus[0].currentPrice[0].__value__),
        currency: item.sellingStatus[0].currentPrice[0]['@currencyId'],
        endTime: endTime,
        listingDays: listingDays,
        condition: item.condition ? item.condition[0].conditionDisplayName[0] : 'Unknown'
      };
    }).filter(item => item.price > 0 && item.price < 1000); // Filter out extreme prices
    
  } catch (error) {
    console.error('Error in performEbaySearch:', error);
    return [];
  }
}
// Debug function to test eBay API directly
app.get('/api/debug-ebay/:searchTerm', async (req, res) => {
  try {
    const searchTerm = req.params.searchTerm;
    console.log('🔧 Debug: Testing eBay API with term:', searchTerm);
    
    const encodedTerm = encodeURIComponent(searchTerm);
    const url = `https://svcs.ebay.com/services/search/FindingService/v1?` +
      `OPERATION-NAME=findCompletedItems&` +
      `SERVICE-VERSION=1.13.0&` +
      `SECURITY-APPNAME=${process.env.EBAY_APP_ID}&` +
      `RESPONSE-DATA-FORMAT=JSON&` +
      `keywords=${encodedTerm}&` +
      `itemFilter(0).name=SoldItemsOnly&` +
      `itemFilter(0).value=true&` +
      `paginationInput.entriesPerPage=10`;
    
    console.log('🔧 Debug URL:', url);
    
    const response = await fetch(url);
    const data = await response.json();
    
    console.log('🔧 Debug Response:', JSON.stringify(data, null, 2));
    
    res.json({
      searchTerm,
      url,
      response: data
    });
    
  } catch (error) {
    console.error('🔧 Debug Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get eBay sold listings with smart search
async function getEbaySoldListings(itemName) {
  try {
    // Try multiple search strategies for better results
    const searchStrategies = generateSearchTerms(itemName);
    
    for (const searchTerm of searchStrategies) {
      console.log('🔍 Trying eBay search:', searchTerm);
      const results = await performEbaySearch(searchTerm);
      
      if (results.length > 0) {
        console.log('✅ Found', results.length, 'results with search term:', searchTerm);
        return results;
      }
    }
    
    console.log('⚠️ No results found with any search term');
    return [];
    
  } catch (error) {
    console.error('Error fetching eBay sold listings:', error);
    return [];
  }
}

async function getEbayActiveListings(itemName) {
  try {
    // Use the same smart search terms for active listings
    const searchStrategies = generateSearchTerms(itemName);
    
    for (const searchTerm of searchStrategies) {
      const encodedTerm = encodeURIComponent(searchTerm);
      
      // eBay Finding API - findItemsByKeywords for active listings
      const url = `https://svcs.ebay.com/services/search/FindingService/v1?` +
        `OPERATION-NAME=findItemsByKeywords&` +
        `SERVICE-VERSION=1.13.0&` +
        `SECURITY-APPNAME=${process.env.EBAY_APP_ID}&` +
        `RESPONSE-DATA-FORMAT=JSON&` +
        `keywords=${encodedTerm}&` +
        `itemFilter(0).name=ListingType&` +
        `itemFilter(0).value(0)=AuctionWithBIN&` +
        `itemFilter(0).value(1)=FixedPrice&` +
        `itemFilter(1).name=MinPrice&` +
        `itemFilter(1).value=1&` +
        `paginationInput.entriesPerPage=50`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.findItemsByKeywordsResponse && 
          data.findItemsByKeywordsResponse[0].searchResult &&
          data.findItemsByKeywordsResponse[0].searchResult[0].item) {
        const itemCount = data.findItemsByKeywordsResponse[0].searchResult[0].item.length;
        if (itemCount > 0) {
          console.log('📈 Found', itemCount, 'active listings with term:', searchTerm);
          return itemCount;
        }
      }
    }
    
    return 0;
    
  } catch (error) {
    console.error('Error fetching eBay active listings:', error);
    return 0;
  }
}

// eBay API functions
async function getEbayMarketData(itemName) {
  try {
    console.log('🛒 Fetching eBay data for:', itemName);
    
    // Get sold listings from eBay Finding API
    const soldListings = await getEbaySoldListings(itemName);
    console.log('📊 Found', soldListings.length, 'sold listings');
    
    // Get active listings to calculate sell-through rate
    const activeListings = await getEbayActiveListings(itemName);
    console.log('📈 Found', activeListings, 'active listings');
    
    if (soldListings.length === 0) {
      console.log('⚠️ No sold listings found, using fallback data');
      return getFallbackMarketData(itemName);
    }
    
    // Calculate market metrics from real eBay data
    const prices = soldListings.map(item => item.price);
    const avgSoldPrice = Math.round(prices.reduce((sum, price) => sum + price, 0) / prices.length);
    
    // Calculate sell-through rate (sold vs total listings)
    const totalListings = soldListings.length + activeListings;
    const sellThroughRate = totalListings > 0 ? Math.round((soldListings.length / totalListings) * 100) : 50;
    
    // Calculate average listing time from sold items
    const listingTimes = soldListings.map(item => item.listingDays).filter(days => days > 0 && days < 365);
    const avgListingTime = listingTimes.length > 0 ? 
      Math.round(listingTimes.reduce((sum, days) => sum + days, 0) / listingTimes.length) : 15;
    
    // Determine demand level based on sell-through rate
    let demandLevel = 'Low';
    if (sellThroughRate >= 60) demandLevel = 'High';
    else if (sellThroughRate >= 40) demandLevel = 'Medium';
    
    const marketData = {
      avgSoldPrice,
      sellThroughRate,
      avgListingTime,
      demandLevel,
      seasonality: 'Year-round', // Could be enhanced with seasonal analysis
      dataSource: 'eBay API',
      soldListingsCount: soldListings.length,
      activeListingsCount: activeListings
    };
    
    console.log('✅ eBay market data calculated:', marketData);
    return marketData;
    
  } catch (error) {
    console.error('❌ eBay API error:', error.message);
    return getFallbackMarketData(itemName);
  }
}

function getFallbackMarketData(itemName) {
  // Fallback data when eBay API fails
  const categoryLower = itemName.toLowerCase();
  
  if (categoryLower.includes('wilson') && categoryLower.includes('football')) {
    return { avgSoldPrice: 28, sellThroughRate: 65, avgListingTime: 10, demandLevel: "High", seasonality: "Fall peak", dataSource: 'Estimate' };
  }
  if (categoryLower.includes('football')) {
    return { avgSoldPrice: 25, sellThroughRate: 60, avgListingTime: 12, demandLevel: "Medium", seasonality: "Fall peak", dataSource: 'Estimate' };
  }
  if (categoryLower.includes('baseball') && (categoryLower.includes('cap') || categoryLower.includes('hat'))) {
    return { avgSoldPrice: 22, sellThroughRate: 55, avgListingTime: 14, demandLevel: "Medium", seasonality: "Year-round", dataSource: 'Estimate' };
  }
  if (categoryLower.includes('hat') || categoryLower.includes('cap')) {
    return { avgSoldPrice: 18, sellThroughRate: 50, avgListingTime: 16, demandLevel: "Medium", seasonality: "Year-round", dataSource: 'Estimate' };
  }
  if (categoryLower.includes('baseball')) {
    return { avgSoldPrice: 35, sellThroughRate: 58, avgListingTime: 14, demandLevel: "Medium", seasonality: "Spring/Summer peak", dataSource: 'Estimate' };
  }
  
  return { 
    avgSoldPrice: 30, 
    sellThroughRate: 45, 
    avgListingTime: 18, 
    demandLevel: "Medium", 
    seasonality: "Year-round",
    dataSource: 'Estimate'
  };
}

// Image analysis endpoint
app.post('/api/analyze-image', upload.single('image'), async (req, res) => {
  try {
    console.log('📸 Received image for analysis');
    
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    // Convert image to base64
    const base64Image = req.file.buffer.toString('base64');
    console.log('🔄 Converting image and calling Google Vision API...');

    // Call Google Vision API
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

    // Process the results
    const annotations = data.responses[0];
    const objects = annotations.localizedObjectAnnotations || [];
    const labels = annotations.labelAnnotations || [];
    const text = annotations.textAnnotations || [];
    const logos = annotations.logoAnnotations || [];

    console.log('🔍 Google Vision detected:');
    console.log('Objects:', objects.map(o => o.name));
    console.log('Labels:', labels.map(l => l.description));
    console.log('Logos:', logos.map(l => l.description));

    // Combine all detections
    const allDetections = [
      ...objects.map(obj => ({ type: 'object', description: obj.name, score: obj.score })),
      ...labels.map(label => ({ type: 'label', description: label.description, score: label.score })),
      ...logos.map(logo => ({ type: 'logo', description: logo.description, score: logo.score }))
    ];

    allDetections.sort((a, b) => b.score - a.score);

    // Categorize the item
    const category = categorizeItem(allDetections, text);
    const confidence = Math.round((allDetections[0]?.score || 0) * 100);

    console.log('✅ Final result:', category, `(${confidence}% confidence)`);

    // Get real eBay market data
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
  
  // Sports equipment - specific brand detection
  if ((allContent.includes('football') || allContent.includes('american football')) && allContent.includes('wilson')) {
    return 'Wilson Football';
  }
  if (allContent.includes('football') || allContent.includes('american football')) {
    return 'Football';
  }
  if (allContent.includes('basketball') && allContent.includes('nike')) {
    return 'Nike Basketball';
  }
  if (allContent.includes('basketball')) {
    return 'Basketball';
  }
  if (allContent.includes('baseball') || allContent.includes('bat')) {
    return 'Baseball Equipment';
  }
  if (allContent.includes('soccer') && allContent.includes('ball')) {
    return 'Soccer Ball';
  }
  if ((allContent.includes('hat') || allContent.includes('cap')) && allContent.includes('baseball')) {
    return 'Baseball Cap';
  }
  if ((allContent.includes('hat') || allContent.includes('cap')) && allContent.includes('titleist')) {
    return 'Titleist Golf Hat';
  }
  if (allContent.includes('hat') || allContent.includes('cap')) {
    return 'Hat';
  }
  
  // Clothing
  if (allContent.includes('jacket') || allContent.includes('coat') || allContent.includes('leather')) {
    return 'Jacket';
  }
  if (allContent.includes('shoe') || allContent.includes('sneaker') || allContent.includes('boot')) {
    return 'Athletic Sneakers';
  }
  if (allContent.includes('shirt') || allContent.includes('t-shirt')) {
    return 'T-Shirt';
  }
  
  // Electronics & Gadgets
  if (allContent.includes('phone') || allContent.includes('mobile')) {
    return 'Smartphone';
  }
  if (allContent.includes('camera')) {
    return 'Camera';
  }
  if (allContent.includes('radio') || allContent.includes('stereo')) {
    return 'Electronics';
  }
  if (allContent.includes('binoculars') || allContent.includes('binocular')) {
    return 'Binoculars';
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
    ebayIntegration: 'Active'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Thrift Flip Analyzer Backend Server',
    endpoints: {
      health: '/api/health',
      analyze: '/api/analyze-image (POST)'
    },
    integrations: {
      googleVision: 'Active',
      ebayAPI: 'Active'
    }
  });
});

app.listen(PORT, () => {
  console.log('🚀 Thrift Flip Backend Server Started!');
  console.log(`📡 Server running on http://localhost:${PORT}`);
  console.log('🔑 Google Vision API key loaded');
  console.log('🛒 eBay API credentials loaded');
  console.log('📱 Ready to analyze images with real market data!');
  console.log('\n📋 Available endpoints:');
  console.log(`   Health check: http://localhost:${PORT}/api/health`);
  console.log(`   Image analysis: http://localhost:${PORT}/api/analyze-image`);
});
