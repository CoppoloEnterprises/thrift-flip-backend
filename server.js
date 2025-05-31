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
    'https://thrift-flipper-app.netlify.app'  // Add your specific Netlify URL
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

    // Call Google Vision API
    const visionRequest = {
      requests: [
        {
          image: {
            content: base64Image
          },
          features: [
            { type: 'OBJECT_LOCALIZATION', maxResults: 15 },
            { type: 'LABEL_DETECTION', maxResults: 15 },
            { type: 'TEXT_DETECTION', maxResults: 10 },
            { type: 'LOGO_DETECTION', maxResults: 10 },
            { type: 'PRODUCT_SEARCH', maxResults: 5 }
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
    console.log('Objects:', objects.map(o => `${o.name} (${Math.round(o.score * 100)}%)`));
    console.log('Labels:', labels.map(l => `${l.description} (${Math.round(l.score * 100)}%)`));
    console.log('Logos:', logos.map(l => `${l.description} (${Math.round(l.score * 100)}%)`));
    if (text.length > 0) {
      console.log('Text detected:', text[0].description.substring(0, 100));
    }

    // Combine all detections
    const allDetections = [
      ...objects.map(obj => ({ type: 'object', description: obj.name, score: obj.score })),
      ...labels.map(label => ({ type: 'label', description: label.description, score: label.score })),
      ...logos.map(logo => ({ type: 'logo', description: logo.description, score: logo.score * 1.2 })) // Boost logo confidence
    ];

    // Sort by score
    allDetections.sort((a, b) => b.score - a.score);

    // Enhanced categorization
    const category = categorizeItem(allDetections, text);
    const confidence = Math.round((allDetections[0]?.score || 0) * 100);

    console.log('✅ Final result:', category, `(${confidence}% confidence)`);

    res.json({
      category,
      confidence,
      detections: allDetections,
      brands: logos.map(logo => logo.description),
      text: text.map(t => t.description).join(' ')
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
  console.log('🔍 Top detections:', detections.slice(0, 3).map(d => `${d.description} (${Math.round(d.score * 100)}%)`));
  
  // Get the highest confidence detection as primary category
  const primaryDetection = detections[0]?.description || 'Unknown Item';
  const topScore = detections[0]?.score || 0;
  
  // Enhanced brand and model detection
  const brands = {
    'nike': /nike|swoosh|air\s+jordan|jordan\s+\d+/i,
    'adidas': /adidas|three\s+stripes|trefoil/i,
    'wilson': /wilson/i,
    'titleist': /titleist/i,
    'footjoy': /footjoy|fj/i,
    'callaway': /callaway/i,
    'ping': /ping\s+golf|ping/i,
    'taylormade': /taylormade|taylor\s+made/i,
    'apple': /apple|iphone|ipad|macbook|airpods/i,
    'samsung': /samsung|galaxy/i,
    'canon': /canon/i,
    'nikon': /nikon/i,
    'sony': /sony/i,
    'rolex': /rolex/i,
    'omega': /omega/i,
    'coach': /coach/i,
    'louis vuitton': /louis\s+vuitton|lv\s+monogram/i,
    'gucci': /gucci/i,
    'polo ralph lauren': /polo\s+ralph\s+lauren|polo/i,
    'patagonia': /patagonia/i,
    'north face': /north\s+face|northface/i,
    'levi': /levi|levis/i,
    'carhartt': /carhartt/i,
    'under armour': /under\s+armour|underarmour/i,
    'supreme': /supreme/i,
    'off-white': /off-white|off\s+white/i,
    'yeezy': /yeezy|kanye/i
  };
  
  // Detect brands
  let detectedBrand = '';
  for (const [brand, pattern] of Object.entries(brands)) {
    if (pattern.test(allContent)) {
      detectedBrand = brand;
      console.log(`🏷️ Detected brand: ${brand}`);
      break;
    }
  }
  
  // Enhanced category detection with confidence scoring
  const categoryRules = [
    // High-Value Sneakers
    {
      pattern: /(air\s+jordan|jordan\s+\d+)/i,
      category: 'Air Jordan Sneakers',
      confidence: 0.95
    },
    {
      pattern: /yeezy/i,
      category: 'Yeezy Sneakers',
      confidence: 0.95
    },
    {
      pattern: /(nike|swoosh).*(?:shoe|sneaker|trainer)/i,
      category: 'Nike Sneakers',
      confidence: 0.9
    },
    {
      pattern: /(adidas|three\s+stripes).*(?:shoe|sneaker|trainer)/i,
      category: 'Adidas Sneakers',
      confidence: 0.9
    },
    
    // Premium Golf Equipment
    {
      pattern: /titleist.*(?:golf|club|ball)/i,
      category: 'Titleist Golf Equipment',
      confidence: 0.95
    },
    {
      pattern: /callaway.*(?:golf|club|driver)/i,
      category: 'Callaway Golf Equipment',
      confidence: 0.95
    },
    {
      pattern: /ping.*(?:golf|club|putter)/i,
      category: 'Ping Golf Equipment',
      confidence: 0.95
    },
    {
      pattern: /taylormade.*(?:golf|club|driver)/i,
      category: 'TaylorMade Golf Equipment',
      confidence: 0.95
    },
    {
      pattern: /golf.*(?:club|driver|iron|putter|wedge)/i,
      category: detectedBrand ? `${capitalizeFirst(detectedBrand)} Golf Equipment` : 'Golf Equipment',
      confidence: 0.8
    },
    
    // Electronics - High Value
    {
      pattern: /(iphone|apple.*phone)/i,
      category: 'iPhone',
      confidence: 0.95
    },
    {
      pattern: /(ipad|apple.*tablet)/i,
      category: 'iPad',
      confidence: 0.95
    },
    {
      pattern: /(macbook|apple.*laptop)/i,
      category: 'MacBook',
      confidence: 0.95
    },
    {
      pattern: /airpods/i,
      category: 'AirPods',
      confidence: 0.95
    },
    {
      pattern: /(galaxy|samsung).*(?:phone|smartphone)/i,
      category: 'Samsung Galaxy Phone',
      confidence: 0.9
    },
    {
      pattern: /smartphone|mobile.*phone|cell.*phone/i,
      category: detectedBrand ? `${capitalizeFirst(detectedBrand)} Phone` : 'Smartphone',
      confidence: 0.8
    },
    {
      pattern: /(dslr|mirrorless).*camera|camera.*(?:canon|nikon|sony)/i,
      category: detectedBrand ? `${capitalizeFirst(detectedBrand)} Camera` : 'DSLR Camera',
      confidence: 0.85
    },
    {
      pattern: /camera/i,
      category: detectedBrand ? `${capitalizeFirst(detectedBrand)} Camera` : 'Camera',
      confidence: 0.8
    },
    
    // Sports Equipment
    {
      pattern: /(american\s+)?football.*wilson|wilson.*football/i,
      category: 'Wilson Football',
      confidence: 0.95
    },
    {
      pattern: /(american\s+)?football(?!.*soccer)/i,
      category: detectedBrand ? `${capitalizeFirst(detectedBrand)} Football` : 'Football',
      confidence: 0.8
    },
    {
      pattern: /basketball/i,
      category: detectedBrand ? `${capitalizeFirst(detectedBrand)} Basketball` : 'Basketball',
      confidence: 0.8
    },
    {
      pattern: /baseball.*(?:bat|glove)|softball/i,
      category: 'Baseball Equipment',
      confidence: 0.8
    },
    {
      pattern: /soccer.*ball|football.*(?:round|soccer)/i,
      category: 'Soccer Ball',
      confidence: 0.8
    },
    {
      pattern: /tennis.*(?:racket|racquet)/i,
      category: 'Tennis Racket',
      confidence: 0.8
    },
    
    // Designer Clothing
    {
      pattern: /supreme/i,
      category: 'Supreme Clothing',
      confidence: 0.95
    },
    {
      pattern: /off-white|off\s+white/i,
      category: 'Off-White Clothing',
      confidence: 0.95
    },
    {
      pattern: /polo\s+ralph\s+lauren/i,
      category: 'Polo Ralph Lauren',
      confidence: 0.9
    },
    {
      pattern: /patagonia/i,
      category: 'Patagonia Jacket',
      confidence: 0.85
    },
    {
      pattern: /north\s+face/i,
      category: 'North Face Jacket',
      confidence: 0.85
    },
    {
      pattern: /(leather\s+)?jacket|coat/i,
      category: detectedBrand ? `${capitalizeFirst(detectedBrand)} Jacket` : 'Vintage Leather Jacket',
      confidence: 0.7
    },
    {
      pattern: /(?:running|athletic|sports)\s+(?:shoe|sneaker)/i,
      category: detectedBrand ? `${capitalizeFirst(detectedBrand)} Sneakers` : 'Athletic Sneakers',
      confidence: 0.7
    },
    {
      pattern: /jeans|denim/i,
      category: detectedBrand ? `${capitalizeFirst(detectedBrand)} Jeans` : 'Designer Jeans',
      confidence: 0.7
    },
    {
      pattern: /hoodie|sweatshirt/i,
      category: detectedBrand ? `${capitalizeFirst(detectedBrand)} Hoodie` : 'Branded Hoodie',
      confidence: 0.7
    },
    {
      pattern: /(t-?shirt|tee)/i,
      category: detectedBrand ? `${capitalizeFirst(detectedBrand)} T-Shirt` : 'Vintage T-Shirt',
      confidence: 0.6
    },
    
    // Luxury Accessories
    {
      pattern: /rolex/i,
      category: 'Rolex Watch',
      confidence: 0.95
    },
    {
      pattern: /omega.*watch/i,
      category: 'Omega Watch',
      confidence: 0.95
    },
    {
      pattern: /louis\s+vuitton|lv\s+monogram/i,
      category: 'Louis Vuitton Handbag',
      confidence: 0.95
    },
    {
      pattern: /gucci/i,
      category: 'Gucci Accessory',
      confidence: 0.95
    },
    {
      pattern: /coach.*(?:bag|purse|handbag)/i,
      category: 'Coach Handbag',
      confidence: 0.9
    },
    {
      pattern: /watch|timepiece/i,
      category: detectedBrand ? `${capitalizeFirst(detectedBrand)} Watch` : 'Luxury Watch',
      confidence: 0.8
    },
    {
      pattern: /(?:hand)?bag|purse|tote|satchel/i,
      category: detectedBrand ? `${capitalizeFirst(detectedBrand)} Handbag` : 'Designer Handbag',
      confidence: 0.75
    },
    {
      pattern: /backpack|rucksack/i,
      category: detectedBrand ? `${capitalizeFirst(detectedBrand)} Backpack` : 'Backpack',
      confidence: 0.7
    },
    {
      pattern: /sunglasses/i,
      category: detectedBrand ? `${capitalizeFirst(detectedBrand)} Sunglasses` : 'Designer Sunglasses',
      confidence: 0.7
    },
    
    // Collectibles
    {
      pattern: /vinyl|record|lp\s+/i,
      category: 'Vintage Vinyl Record',
      confidence: 0.8
    },
    {
      pattern: /comic.*book/i,
      category: 'Comic Book',
      confidence: 0.8
    },
    {
      pattern: /action.*figure|collectible.*figure/i,
      category: 'Collectible Action Figure',
      confidence: 0.8
    },
    {
      pattern: /trading.*card|pokemon.*card|magic.*card/i,
      category: 'Trading Cards',
      confidence: 0.8
    },
    
    // Tools & Equipment
    {
      pattern: /power.*tool|drill|saw/i,
      category: 'Power Tools',
      confidence: 0.8
    },
    {
      pattern: /tool|wrench|hammer/i,
      category: 'Hand Tools',
      confidence: 0.7
    },
    
    // Home & Kitchen
    {
      pattern: /(?:kitchen|stand).*mixer|kitchenaid/i,
      category: 'Kitchen Mixer',
      confidence: 0.8
    },
    {
      pattern: /blender|food.*processor/i,
      category: 'Kitchen Appliance',
      confidence: 0.8
    },
    {
      pattern: /cast.*iron|le.*creuset/i,
      category: 'Cast Iron Cookware',
      confidence: 0.8
    },
    
    // Art & Decor
    {
      pattern: /pottery|ceramic|vase/i,
      category: 'Vintage Pottery',
      confidence: 0.7
    },
    {
      pattern: /painting|artwork|print/i,
      category: 'Artwork',
      confidence: 0.7
    },
    {
      pattern: /lamp|lighting/i,
      category: 'Vintage Lamp',
      confidence: 0.7
    }
  ];
  
  // Find the best matching category
  let bestMatch = null;
  let bestScore = 0;
  
  for (const rule of categoryRules) {
    if (rule.pattern.test(allContent)) {
      const score = rule.confidence * topScore;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = rule;
      }
    }
  }
  
  if (bestMatch) {
    console.log(`✅ Matched category: ${bestMatch.category} (confidence: ${Math.round(bestScore * 100)}%)`);
    return bestMatch.category;
  }
  
  // Fallback logic - improve generic detection
  const capitalizedPrimary = capitalizeFirst(primaryDetection);
  
  // Add brand prefix if detected and not already included
  if (detectedBrand && !capitalizedPrimary.toLowerCase().includes(detectedBrand)) {
    return `${capitalizeFirst(detectedBrand)} ${capitalizedPrimary}`;
  }
  
  // Add descriptive prefixes for certain items
  const vintageItems = ['typewriter', 'rotary phone', 'gramophone', 'record player', 'radio'];
  const collectibleItems = ['toy', 'doll', 'figure', 'game'];
  
  if (vintageItems.some(item => allContent.includes(item))) {
    return `Vintage ${capitalizedPrimary}`;
  }
  
  if (collectibleItems.some(item => allContent.includes(item))) {
    return `Collectible ${capitalizedPrimary}`;
  }
  
  console.log(`📝 Using fallback category: ${capitalizedPrimary}`);
  return capitalizedPrimary;
}

function capitalizeFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'Server is running!',
    timestamp: new Date().toISOString(),
    version: '2.0'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Thrift Flip Analyzer Backend Server v2.0',
    features: [
      'Enhanced AI categorization',
      'Brand detection',
      'Improved accuracy',
      'Better error handling'
    ],
    endpoints: {
      health: '/api/health',
      analyze: '/api/analyze-image (POST)'
    }
  });
});

app.listen(PORT, () => {
  console.log('🚀 Thrift Flip Backend Server v2.0 Started!');
  console.log(`📡 Server running on http://localhost:${PORT}`);
  console.log('🔑 Google Vision API key:', process.env.GOOGLE_VISION_API_KEY ? 'Loaded ✅' : 'Missing ❌');
  console.log('📱 Ready to analyze images with enhanced categorization!');
  console.log('\n📋 Available endpoints:');
  console.log(`   Health check: http://localhost:${PORT}/api/health`);
  console.log(`   Image analysis: http://localhost:${PORT}/api/analyze-image`);
  console.log('\n🆕 New features:');
  console.log('   • Enhanced brand detection');
  console.log('   • Improved categorization accuracy');
  console.log('   • Better handling of premium items');
  console.log('   • More specific product identification');
});
