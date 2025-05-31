const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: [
    'http://localhost:3000', 
    'https://claude.ai', 
    'https://railway.app', 
    'https://*.railway.app', 
    'https://*.github.io', 
    'https://*.netlify.app',
    'https://thrift-flipper-app.netlify.app'
  ],
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

    // Enhanced Google Vision API request
    const visionRequest = {
      requests: [
        {
          image: {
            content: base64Image
          },
          features: [
            { type: 'OBJECT_LOCALIZATION', maxResults: 20 },
            { type: 'LABEL_DETECTION', maxResults: 20 },
            { type: 'TEXT_DETECTION', maxResults: 10 },
            { type: 'LOGO_DETECTION', maxResults: 10 },
            { type: 'WEB_DETECTION', maxResults: 10 } // Added for better context
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
    const webDetection = annotations.webDetection || {};

    console.log('🔍 Google Vision detected:');
    console.log('Objects:', objects.slice(0, 5).map(o => `${o.name} (${Math.round(o.score * 100)}%)`));
    console.log('Labels:', labels.slice(0, 8).map(l => `${l.description} (${Math.round(l.score * 100)}%)`));
    console.log('Logos:', logos.map(l => `${l.description} (${Math.round(l.score * 100)}%)`));
    if (text.length > 0) {
      console.log('Text detected:', text[0].description.substring(0, 100));
    }
    if (webDetection.webEntities) {
      console.log('Web entities:', webDetection.webEntities.slice(0, 3).map(e => e.description));
    }

    // Combine all detections with proper weighting
    const allDetections = [
      ...objects.map(obj => ({ type: 'object', description: obj.name, score: obj.score * 1.2 })), // Boost objects
      ...labels.map(label => ({ type: 'label', description: label.description, score: label.score })),
      ...logos.map(logo => ({ type: 'logo', description: logo.description, score: logo.score * 1.5 })), // Boost logos
      ...(webDetection.webEntities || []).map(entity => ({ type: 'web', description: entity.description, score: (entity.score || 0.5) * 0.8 }))
    ];

    // Sort by score
    allDetections.sort((a, b) => b.score - a.score);

    // Enhanced categorization with better context
    const categoryResult = categorizeItem(allDetections, text, logos);
    const confidence = Math.round((allDetections[0]?.score || 0) * 100);

    console.log('✅ Final result:', categoryResult.category, `(${confidence}% confidence)`);

    res.json({
      category: categoryResult.category,
      confidence,
      detections: allDetections.slice(0, 10), // Return top 10 detections
      brands: logos.map(logo => logo.description),
      text: text.map(t => t.description).join(' '),
      avgPrice: categoryResult.avgPrice || null,
      notes: categoryResult.notes || null
    });

  } catch (error) {
    console.error('❌ Error analyzing image:', error);
    res.status(500).json({ error: 'Failed to analyze image: ' + error.message });
  }
});

function categorizeItem(detections, textDetections, logos = []) {
  const keywords = detections.map(d => d.description.toLowerCase()).join(' ');
  const textContent = textDetections.map(t => t.description.toLowerCase()).join(' ');
  const logoText = logos.map(l => l.description.toLowerCase()).join(' ');
  const allContent = (keywords + ' ' + textContent + ' ' + logoText).toLowerCase();
  
  console.log('🏷️ Analyzing keywords:', allContent.substring(0, 200));
  console.log('🔍 Top detections:', detections.slice(0, 5).map(d => `${d.description} (${Math.round(d.score * 100)}%)`));
  
  // Get the highest confidence detection
  const primaryDetection = detections[0]?.description || 'Unknown Item';
  const topScore = detections[0]?.score || 0;
  
  // Enhanced brand detection
  const brandPatterns = {
    'titleist': /titleist/i,
    'nike': /nike|swoosh/i,
    'adidas': /adidas|three\s+stripes/i,
    'callaway': /callaway/i,
    'ping': /ping/i,
    'taylormade': /taylormade|taylor\s+made/i,
    'footjoy': /footjoy|fj/i,
    'under armour': /under\s+armour|underarmour/i,
    'polo ralph lauren': /polo\s+ralph\s+lauren|polo/i,
    'patagonia': /patagonia/i,
    'north face': /north\s+face|northface/i,
    'supreme': /supreme/i,
    'carhartt': /carhartt/i,
    'levi': /levi|levis/i,
    'apple': /apple|iphone|ipad|macbook/i,
    'samsung': /samsung|galaxy/i,
    'rolex': /rolex/i,
    'omega': /omega/i,
    'coach': /coach/i,
    'louis vuitton': /louis\s+vuitton|lv/i,
    'gucci': /gucci/i
  };
  
  let detectedBrand = '';
  for (const [brand, pattern] of Object.entries(brandPatterns)) {
    if (pattern.test(allContent)) {
      detectedBrand = brand;
      console.log(`🏷️ Detected brand: ${brand}`);
      break;
    }
  }
  
  // PRIORITY RULES - Most specific first
  const categoryRules = [
    // HATS & CAPS - Highest priority to avoid confusion with equipment
    {
      pattern: /(?:hat|cap|beanie|visor|headwear).*titleist|titleist.*(?:hat|cap|beanie|visor|headwear)/i,
      category: 'Titleist Golf Hat',
      confidence: 0.95,
      avgPrice: 28,
      notes: 'Popular golf brand hat'
    },
    {
      pattern: /(?:hat|cap|beanie|visor).*(?:nike|adidas|under\s+armour)|(?:nike|adidas|under\s+armour).*(?:hat|cap|beanie|visor)/i,
      category: detectedBrand ? `${capitalizeFirst(detectedBrand)} Hat` : 'Athletic Hat',
      confidence: 0.9,
      avgPrice: 22
    },
    {
      pattern: /baseball.*cap|snapback|fitted.*cap|trucker.*hat/i,
      category: detectedBrand ? `${capitalizeFirst(detectedBrand)} Baseball Cap` : 'Baseball Cap',
      confidence: 0.85,
      avgPrice: 18
    },
    {
      pattern: /(?:hat|cap|beanie|visor|headwear)(?!.*(?:club|driver|iron|putter|bag))/i,
      category: detectedBrand ? `${capitalizeFirst(detectedBrand)} Hat` : 'Hat',
      confidence: 0.8,
      avgPrice: 15
    },
    
    // GOLF EQUIPMENT - Only actual golf clubs and equipment
    {
      pattern: /golf.*(?:club|driver|iron|putter|wedge|wood|hybrid)|(?:driver|iron|putter|wedge).*golf/i,
      category: detectedBrand ? `${capitalizeFirst(detectedBrand)} Golf Club` : 'Golf Club',
      confidence: 0.95,
      avgPrice: 85
    },
    {
      pattern: /golf.*(?:bag|cart)|(?:bag|cart).*golf/i,
      category: detectedBrand ? `${capitalizeFirst(detectedBrand)} Golf Bag` : 'Golf Bag',
      confidence: 0.9,
      avgPrice: 65
    },
    {
      pattern: /golf.*ball/i,
      category: 'Golf Balls',
      confidence: 0.8,
      avgPrice: 25
    },
    
    // FOOTWEAR
    {
      pattern: /(air\s+jordan|jordan\s+\d+)/i,
      category: 'Air Jordan Sneakers',
      confidence: 0.95,
      avgPrice: 125
    },
    {
      pattern: /yeezy/i,
      category: 'Yeezy Sneakers',
      confidence: 0.95,
      avgPrice: 150
    },
    {
      pattern: /nike.*(?:shoe|sneaker|trainer)|(?:shoe|sneaker|trainer).*nike/i,
      category: 'Nike Sneakers',
      confidence: 0.9,
      avgPrice: 75
    },
    {
      pattern: /adidas.*(?:shoe|sneaker|trainer)|(?:shoe|sneaker|trainer).*adidas/i,
      category: 'Adidas Sneakers',
      confidence: 0.9,
      avgPrice: 65
    },
    {
      pattern: /golf.*(?:shoe|cleat)|(?:shoe|cleat).*golf|footjoy/i,
      category: detectedBrand ? `${capitalizeFirst(detectedBrand)} Golf Shoes` : 'Golf Shoes',
      confidence: 0.85,
      avgPrice: 58
    },
    {
      pattern: /(?:running|athletic|sports).*(?:shoe|sneaker)|(?:shoe|sneaker).*(?:running|athletic|sports)/i,
      category: detectedBrand ? `${capitalizeFirst(detectedBrand)} Athletic Shoes` : 'Athletic Shoes',
      confidence: 0.8,
      avgPrice: 55
    },
    {
      pattern: /boot|hiking.*shoe|work.*shoe/i,
      category: detectedBrand ? `${capitalizeFirst(detectedBrand)} Boots` : 'Boots',
      confidence: 0.75,
      avgPrice: 65
    },
    {
      pattern: /(?:shoe|sneaker|footwear)/i,
      category: detectedBrand ? `${capitalizeFirst(detectedBrand)} Shoes` : 'Shoes',
      confidence: 0.7,
      avgPrice: 45
    },
    
    // ELECTRONICS
    {
      pattern: /iphone/i,
      category: 'iPhone',
      confidence: 0.95,
      avgPrice: 285
    },
    {
      pattern: /ipad/i,
      category: 'iPad',
      confidence: 0.95,
      avgPrice: 225
    },
    {
      pattern: /macbook/i,
      category: 'MacBook',
      confidence: 0.95,
      avgPrice: 485
    },
    {
      pattern: /airpods/i,
      category: 'AirPods',
      confidence: 0.95,
      avgPrice: 95
    },
    {
      pattern: /smartphone|mobile.*phone|cell.*phone/i,
      category: detectedBrand ? `${capitalizeFirst(detectedBrand)} Phone` : 'Smartphone',
      confidence: 0.8,
      avgPrice: 145
    },
    {
      pattern: /camera|dslr/i,
      category: detectedBrand ? `${capitalizeFirst(detectedBrand)} Camera` : 'Camera',
      confidence: 0.8,
      avgPrice: 185
    },
    
    // SPORTS EQUIPMENT
    {
      pattern: /football.*wilson|wilson.*football/i,
      category: 'Wilson Football',
      confidence: 0.95,
      avgPrice: 32
    },
    {
      pattern: /(?:american\s+)?football(?!.*soccer)/i,
      category: detectedBrand ? `${capitalizeFirst(detectedBrand)} Football` : 'Football',
      confidence: 0.8,
      avgPrice: 28
    },
    {
      pattern: /basketball/i,
      category: detectedBrand ? `${capitalizeFirst(detectedBrand)} Basketball` : 'Basketball',
      confidence: 0.8,
      avgPrice: 35
    },
    
    // CLOTHING
    {
      pattern: /supreme/i,
      category: 'Supreme Clothing',
      confidence: 0.95,
      avgPrice: 125
    },
    {
      pattern: /polo.*shirt|ralph.*lauren.*shirt/i,
      category: 'Polo Ralph Lauren Shirt',
      confidence: 0.9,
      avgPrice: 42
    },
    {
      pattern: /patagonia.*jacket/i,
      category: 'Patagonia Jacket',
      confidence: 0.85,
      avgPrice: 85
    },
    {
      pattern: /north\s+face.*jacket/i,
      category: 'North Face Jacket',
      confidence: 0.85,
      avgPrice: 95
    },
    {
      pattern: /(?:leather\s+)?jacket|coat/i,
      category: detectedBrand ? `${capitalizeFirst(detectedBrand)} Jacket` : 'Jacket',
      confidence: 0.7,
      avgPrice: 75
    },
    {
      pattern: /jeans|denim/i,
      category: detectedBrand ? `${capitalizeFirst(detectedBrand)} Jeans` : 'Jeans',
      confidence: 0.7,
      avgPrice: 45
    },
    {
      pattern: /hoodie|sweatshirt/i,
      category: detectedBrand ? `${capitalizeFirst(detectedBrand)} Hoodie` : 'Hoodie',
      confidence: 0.7,
      avgPrice: 42
    },
    {
      pattern: /(t-?shirt|tee)/i,
      category: detectedBrand ? `${capitalizeFirst(detectedBrand)} T-Shirt` : 'T-Shirt',
      confidence: 0.6,
      avgPrice: 28
    },
    
    // ACCESSORIES
    {
      pattern: /rolex/i,
      category: 'Rolex Watch',
      confidence: 0.95,
      avgPrice: 3500
    },
    {
      pattern: /omega.*watch/i,
      category: 'Omega Watch',
      confidence: 0.95,
      avgPrice: 1800
    },
    {
      pattern: /watch|timepiece/i,
      category: detectedBrand ? `${capitalizeFirst(detectedBrand)} Watch` : 'Watch',
      confidence: 0.8,
      avgPrice: 95
    },
    {
      pattern: /louis\s+vuitton|lv.*bag/i,
      category: 'Louis Vuitton Handbag',
      confidence: 0.95,
      avgPrice: 485
    },
    {
      pattern: /gucci.*(?:bag|purse)/i,
      category: 'Gucci Handbag',
      confidence: 0.95,
      avgPrice: 385
    },
    {
      pattern: /coach.*(?:bag|purse|handbag)/i,
      category: 'Coach Handbag',
      confidence: 0.9,
      avgPrice: 145
    },
    {
      pattern: /(?:hand)?bag|purse|tote|satchel/i,
      category: detectedBrand ? `${capitalizeFirst(detectedBrand)} Handbag` : 'Handbag',
      confidence: 0.75,
      avgPrice: 45
    },
    {
      pattern: /backpack|rucksack/i,
      category: detectedBrand ? `${capitalizeFirst(detectedBrand)} Backpack` : 'Backpack',
      confidence: 0.7,
      avgPrice: 38
    },
    {
      pattern: /sunglasses/i,
      category: detectedBrand ? `${capitalizeFirst(detectedBrand)} Sunglasses` : 'Sunglasses',
      confidence: 0.7,
      avgPrice: 52
    }
  ];
  
  // Find the best matching category (take first match since ordered by priority)
  for (const rule of categoryRules) {
    if (rule.pattern.test(allContent)) {
      console.log(`✅ Matched category: ${rule.category} (avg price: $${rule.avgPrice})`);
      return {
        category: rule.category,
        avgPrice: rule.avgPrice,
        notes: rule.notes || ''
      };
    }
  }
  
  // Enhanced fallback
  const capitalizedPrimary = capitalizeFirst(primaryDetection);
  let fallbackPrice = 35;
  
  // Better fallback price estimation
  if (allContent.includes('hat') || allContent.includes('cap')) fallbackPrice = 18;
  else if (allContent.includes('shoe') || allContent.includes('sneaker')) fallbackPrice = 55;
  else if (allContent.includes('electronic') || allContent.includes('phone')) fallbackPrice = 125;
  else if (allContent.includes('watch')) fallbackPrice = 85;
  else if (allContent.includes('bag') || allContent.includes('purse')) fallbackPrice = 45;
  else if (allContent.includes('clothing') || allContent.includes('shirt')) fallbackPrice = 32;
  
  // Add brand prefix if detected
  let finalCategory = capitalizedPrimary;
  if (detectedBrand && !capitalizedPrimary.toLowerCase().includes(detectedBrand)) {
    finalCategory = `${capitalizeFirst(detectedBrand)} ${capitalizedPrimary}`;
  }
  
  console.log(`📝 Using fallback: ${finalCategory} (estimated price: $${fallbackPrice})`);
  return {
    category: finalCategory,
    avgPrice: fallbackPrice,
    notes: 'Estimated pricing - verify market value'
  };
}

function capitalizeFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'Server is running!',
    timestamp: new Date().toISOString(),
    version: '3.0 - Enhanced Accuracy'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Thrift Flip Analyzer Backend Server v3.0',
    features: [
      'Enhanced categorization accuracy',
      'Priority-based item type detection',
      'Better brand recognition',
      'Improved price estimation',
      'Hat vs Equipment distinction'
    ],
    endpoints: {
      health: '/api/health',
      analyze: '/api/analyze-image (POST)'
    }
  });
});

app.listen(PORT, () => {
  console.log('🚀 Thrift Flip Backend Server v3.0 Started!');
  console.log(`📡 Server running on http://localhost:${PORT}`);
  console.log('🔑 Google Vision API key:', process.env.GOOGLE_VISION_API_KEY ? 'Loaded ✅' : 'Missing ❌');
  console.log('📱 Ready for enhanced image analysis!');
  console.log('\n📋 Available endpoints:');
  console.log(`   Health check: http://localhost:${PORT}/api/health`);
  console.log(`   Image analysis: http://localhost:${PORT}/api/analyze-image`);
  console.log('\n🆕 v3.0 improvements:');
  console.log('   • Hat vs Equipment distinction');
  console.log('   • Priority-based categorization');
  console.log('   • Enhanced brand detection');
  console.log('   • Better price accuracy');
  console.log('   • More specific item types');
});
