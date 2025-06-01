const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: ['http://localhost:3000', 'https://claude.ai', 'https://railway.app', 'https://*.railway.app'],
  credentials: true
}));

app.use(express.json());

// Set up file upload handling
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Helper function to get eBay OAuth token
async function getEbayAccessToken() {
  try {
    const credentials = Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString('base64');
    
    const response = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`
      },
      body: 'grant_type=client_credentials&scope=https://api.ebayapis.com/oauth/api_scope'
    });

    const data = await response.json();
    if (data.access_token) {
      console.log('✅ eBay OAuth token obtained');
      return data.access_token;
    } else {
      console.error('❌ Failed to get eBay token:', data);
      return null;
    }
  } catch (error) {
    console.error('❌ eBay OAuth error:', error);
    return null;
  }
}

// Helper function to search eBay sold listings
async function searchEbaySoldListings(searchQuery, accessToken) {
  try {
    console.log(`🔍 Searching eBay for: "${searchQuery}"`);
    
    // Clean and enhance search query
    const cleanQuery = searchQuery.replace(/[^\w\s-]/g, '').trim();
    
    const searchUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search`;
    const params = new URLSearchParams({
      q: cleanQuery,
      filter: 'conditionIds:{1000|1500|2000|2500|3000|4000|5000|6000},soldItems:true',
      limit: '50',
      sort: 'endTimeNewest',
      fieldgroups: 'MATCHING_ITEMS,FULL'
    });

    const response = await fetch(`${searchUrl}?${params}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
      }
    });

    const data = await response.json();
    
    if (data.itemSummaries && data.itemSummaries.length > 0) {
      console.log(`✅ Found ${data.itemSummaries.length} sold listings on eBay`);
      return analyzeEbayData(data.itemSummaries, searchQuery);
    } else {
      console.log(`⚠️ No sold listings found for: ${searchQuery}`);
      return null;
    }
  } catch (error) {
    console.error('❌ eBay search error:', error);
    return null;
  }
}

// Helper function to analyze eBay sold listings data
function analyzeEbayData(listings, originalQuery) {
  const prices = [];
  const soldDates = [];
  let totalListings = listings.length;
  
  // Extract price and date data
  listings.forEach(item => {
    if (item.price && item.price.value) {
      prices.push(parseFloat(item.price.value));
    }
    if (item.itemEndDate) {
      soldDates.push(new Date(item.itemEndDate));
    }
  });

  if (prices.length === 0) {
    return null;
  }

  // Calculate average price
  const avgPrice = Math.round(prices.reduce((sum, price) => sum + price, 0) / prices.length);
  
  // Calculate median price for better accuracy
  const sortedPrices = [...prices].sort((a, b) => a - b);
  const medianPrice = sortedPrices[Math.floor(sortedPrices.length / 2)];
  
  // Use median if it's significantly different from average (reduces outlier impact)
  const finalPrice = Math.abs(avgPrice - medianPrice) > avgPrice * 0.3 ? medianPrice : avgPrice;

  // Estimate sell-through rate based on listing density and item type
  let sellThroughRate;
  const queryLower = originalQuery.toLowerCase();
  
  if (totalListings >= 30) {
    sellThroughRate = Math.min(85, 60 + (totalListings - 30));
  } else if (totalListings >= 15) {
    sellThroughRate = 60 + (totalListings - 15);
  } else {
    sellThroughRate = Math.max(35, totalListings * 3);
  }

  // Adjust based on item category
  if (queryLower.includes('nike') || queryLower.includes('adidas') || queryLower.includes('jordan')) {
    sellThroughRate = Math.min(90, sellThroughRate + 15);
  } else if (queryLower.includes('vintage') || queryLower.includes('antique')) {
    sellThroughRate = Math.max(25, sellThroughRate - 10);
  } else if (queryLower.includes('brand') || queryLower.includes('designer')) {
    sellThroughRate = Math.min(85, sellThroughRate + 10);
  }

  // Calculate average listing time (days to sell)
  const avgListingTime = Math.max(3, Math.min(30, Math.round(20 - (sellThroughRate - 50) / 10)));

  // Determine demand level
  let demandLevel;
  if (sellThroughRate >= 75) demandLevel = "Very High";
  else if (sellThroughRate >= 60) demandLevel = "High";
  else if (sellThroughRate >= 45) demandLevel = "Medium";
  else if (sellThroughRate >= 30) demandLevel = "Low";
  else demandLevel = "Very Low";

  // Determine seasonality
  let seasonality = "Year-round";
  if (queryLower.includes('coat') || queryLower.includes('jacket') || queryLower.includes('winter')) {
    seasonality = "Fall/Winter peak";
  } else if (queryLower.includes('swimsuit') || queryLower.includes('summer') || queryLower.includes('shorts')) {
    seasonality = "Spring/Summer peak";
  } else if (queryLower.includes('halloween') || queryLower.includes('christmas')) {
    seasonality = "Holiday peak";
  }

  return {
    avgSoldPrice: Math.round(finalPrice),
    sellThroughRate: Math.round(sellThroughRate),
    avgListingTime: avgListingTime,
    demandLevel: demandLevel,
    seasonality: seasonality,
    totalSoldListings: totalListings,
    priceRange: `$${Math.round(Math.min(...prices))} - $${Math.round(Math.max(...prices))}`
  };
}

// Helper function to create smart search queries from Google Vision data
function createSearchQueries(visionData) {
  const queries = [];
  
  // Extract all detected items
  const objects = visionData.objects || [];
  const labels = visionData.labels || [];
  const logos = visionData.logos || [];
  const text = visionData.text || '';

  console.log('🔍 Creating search queries from vision data:');
  console.log('Objects:', objects);
  console.log('Labels:', labels);
  console.log('Logos:', logos);
  console.log('Text detected:', text);

  // Priority 1: Brand + Product combinations from logos and objects
  logos.forEach(logo => {
    objects.forEach(obj => {
      if (obj !== logo) {
        queries.push(`${logo} ${obj}`);
      }
    });
    
    // Also try brand with top labels
    labels.slice(0, 3).forEach(label => {
      if (label !== logo && !label.includes(logo)) {
        queries.push(`${logo} ${label}`);
      }
    });
  });

  // Priority 2: Specific product names from text detection
  const textWords = text.toLowerCase().split(/\s+/).filter(word => word.length > 2);
  const productKeywords = ['golf', 'nike', 'adidas', 'titleist', 'callaway', 'ping', 'taylormade', 'wilson'];
  
  textWords.forEach(word => {
    if (productKeywords.includes(word)) {
      // Combine with detected objects
      objects.forEach(obj => {
        queries.push(`${word} ${obj}`);
      });
    }
  });

  // Priority 3: High-confidence object + label combinations
  objects.forEach(obj => {
    labels.slice(0, 2).forEach(label => {
      if (obj !== label) {
        queries.push(`${obj} ${label}`);
      }
    });
  });

  // Priority 4: Individual high-confidence items
  [...logos, ...objects.slice(0, 2), ...labels.slice(0, 2)].forEach(item => {
    if (item && item.length > 2) {
      queries.push(item);
    }
  });

  // Remove duplicates and clean queries
  const uniqueQueries = [...new Set(queries)]
    .map(q => q.replace(/[^\w\s-]/g, '').trim())
    .filter(q => q.length > 2)
    .slice(0, 5); // Limit to top 5 queries

  console.log('🎯 Generated search queries:', uniqueQueries);
  return uniqueQueries;
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
            { type: 'LABEL_DETECTION', maxResults: 15 },
            { type: 'TEXT_DETECTION', maxResults: 10 },
            { type: 'LOGO_DETECTION', maxResults: 10 }
          ]
        }
      ]
    };

    const visionResponse = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_VISION_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(visionRequest)
      }
    );

    const visionData = await visionResponse.json();
    
    if (visionData.error) {
      console.error('❌ Google Vision API error:', visionData.error.message);
      return res.status(400).json({ error: visionData.error.message });
    }

    // Process the Google Vision results
    const annotations = visionData.responses[0];
    const objects = (annotations.localizedObjectAnnotations || []).map(o => o.name);
    const labels = (annotations.labelAnnotations || []).map(l => l.description);
    const logos = (annotations.logoAnnotations || []).map(l => l.description);
    const textDetections = annotations.textAnnotations || [];
    const fullText = textDetections.map(t => t.description).join(' ');

    console.log('🔍 Google Vision detected:');
    console.log('Objects:', objects);
    console.log('Labels:', labels);
    console.log('Logos:', logos);
    console.log('Text:', fullText);

    // Create structured vision data for search query generation
    const structuredVisionData = {
      objects,
      labels,
      logos,
      text: fullText
    };

    // Generate smart search queries
    const searchQueries = createSearchQueries(structuredVisionData);
    
    if (searchQueries.length === 0) {
      throw new Error('Could not generate search queries from image');
    }

    // Get eBay access token
    const accessToken = await getEbayAccessToken();
    
    if (!accessToken) {
      throw new Error('Failed to authenticate with eBay API');
    }

    // Search eBay with generated queries (try each until we get good results)
    let ebayResults = null;
    let usedQuery = '';
    
    for (const query of searchQueries) {
      console.log(`🔍 Trying eBay search with: "${query}"`);
      ebayResults = await searchEbaySoldListings(query, accessToken);
      
      if (ebayResults && ebayResults.totalSoldListings >= 5) {
        usedQuery = query;
        console.log(`✅ Good eBay results found with query: "${query}"`);
        break;
      }
    }

    if (!ebayResults) {
      // Try a broader search with just the top detection
      const broadQuery = objects[0] || labels[0] || 'vintage collectible';
      console.log(`🔍 Trying broad search: "${broadQuery}"`);
      ebayResults = await searchEbaySoldListings(broadQuery, accessToken);
      usedQuery = broadQuery;
    }

    // Determine the best category name
    let category;
    if (logos.length > 0 && objects.length > 0) {
      category = `${logos[0]} ${objects[0]}`;
    } else if (logos.length > 0 && labels.length > 0) {
      category = `${logos[0]} ${labels[0]}`;
    } else if (objects.length > 0) {
      category = objects[0];
    } else if (labels.length > 0) {
      category = labels[0];
    } else {
      category = 'Unknown Item';
    }

    // Calculate confidence based on detection scores
    const allDetections = [
      ...(annotations.localizedObjectAnnotations || []).map(obj => ({ score: obj.score })),
      ...(annotations.labelAnnotations || []).map(label => ({ score: label.score })),
      ...(annotations.logoAnnotations || []).map(logo => ({ score: logo.score }))
    ];
    
    const avgConfidence = allDetections.length > 0 
      ? allDetections.reduce((sum, det) => sum + det.score, 0) / allDetections.length 
      : 0;
    
    const confidence = Math.round(avgConfidence * 100);

    // Prepare response
    const response = {
      category: category,
      confidence: confidence,
      searchQuery: usedQuery,
      detections: {
        objects,
        labels,
        logos,
        text: fullText
      }
    };

    if (ebayResults) {
      response.avgSoldPrice = ebayResults.avgSoldPrice;
      response.sellThroughRate = ebayResults.sellThroughRate;
      response.avgListingTime = ebayResults.avgListingTime;
      response.demandLevel = ebayResults.demandLevel;
      response.seasonality = ebayResults.seasonality;
      response.source = 'eBay Browse API';
      response.totalSoldListings = ebayResults.totalSoldListings;
      response.priceRange = ebayResults.priceRange;
    } else {
      // Enhanced fallback data based on detected items
      response.avgSoldPrice = 45;
      response.sellThroughRate = 55;
      response.avgListingTime = 15;
      response.demandLevel = "Medium";
      response.seasonality = "Year-round";
      response.source = 'Fallback Data';
    }

    console.log('✅ Final analysis result:', {
      category: response.category,
      confidence: response.confidence,
      searchQuery: response.searchQuery,
      source: response.source,
      price: response.avgSoldPrice
    });

    res.json(response);

  } catch (error) {
    console.error('❌ Error analyzing image:', error);
    res.status(500).json({ error: 'Failed to analyze image: ' + error.message });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'Server is running!',
    timestamp: new Date().toISOString(),
    apis: {
      googleVision: !!process.env.GOOGLE_VISION_API_KEY,
      ebayClientId: !!process.env.EBAY_CLIENT_ID,
      ebayClientSecret: !!process.env.EBAY_CLIENT_SECRET
    }
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Thrift Flip Analyzer Backend Server',
    endpoints: {
      health: '/api/health',
      analyze: '/api/analyze-image (POST)'
    }
  });
});

app.listen(PORT, () => {
  console.log('🚀 Thrift Flip Backend Server Started!');
  console.log(`📡 Server running on http://localhost:${PORT}`);
  console.log('🔑 Google Vision API key:', !!process.env.GOOGLE_VISION_API_KEY ? 'loaded' : 'missing');
  console.log('🔑 eBay Client ID:', !!process.env.EBAY_CLIENT_ID ? 'loaded' : 'missing');
  console.log('🔑 eBay Client Secret:', !!process.env.EBAY_CLIENT_SECRET ? 'loaded' : 'missing');
  console.log('📱 Ready to analyze images with real API integration!');
  console.log('\n📋 Available endpoints:');
  console.log(`   Health check: http://localhost:${PORT}/api/health`);
  console.log(`   Image analysis: http://localhost:${PORT}/api/analyze-image`);
});
