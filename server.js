const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: '*',
  credentials: true
}));

app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

// Advanced market intelligence database
const BRAND_DATABASE = {
  electronics: {
    apple: {
      iphone: { basePrice: 150, demand: "Very High", listTime: 3, sellRate: 85 },
      ipad: { basePrice: 120, demand: "Very High", listTime: 4, sellRate: 80 },
      macbook: { basePrice: 300, demand: "Very High", listTime: 5, sellRate: 75 },
      airpods: { basePrice: 60, demand: "High", listTime: 3, sellRate: 75 },
      watch: { basePrice: 80, demand: "High", listTime: 4, sellRate: 70 }
    },
    samsung: {
      phone: { basePrice: 100, demand: "High", listTime: 5, sellRate: 65 },
      tablet: { basePrice: 80, demand: "Medium", listTime: 7, sellRate: 55 }
    },
    sony: {
      playstation: { basePrice: 200, demand: "Very High", listTime: 2, sellRate: 90 },
      camera: { basePrice: 150, demand: "High", listTime: 6, sellRate: 70 },
      headphones: { basePrice: 40, demand: "High", listTime: 5, sellRate: 65 }
    },
    nintendo: {
      switch: { basePrice: 180, demand: "Very High", listTime: 2, sellRate: 85 },
      game: { basePrice: 25, demand: "High", listTime: 4, sellRate: 70 }
    },
    microsoft: {
      xbox: { basePrice: 160, demand: "High", listTime: 4, sellRate: 70 },
      surface: { basePrice: 200, demand: "Medium", listTime: 8, sellRate: 55 }
    },
    dyson: {
      vacuum: { basePrice: 120, demand: "High", listTime: 6, sellRate: 75 },
      hairdryer: { basePrice: 150, demand: "Very High", listTime: 3, sellRate: 80 }
    }
  },
  shoes: {
    nike: {
      jordan: { basePrice: 120, demand: "Very High", listTime: 2, sellRate: 90 },
      dunk: { basePrice: 80, demand: "Very High", listTime: 3, sellRate: 85 },
      airmax: { basePrice: 55, demand: "High", listTime: 5, sellRate: 70 },
      airforce: { basePrice: 45, demand: "High", listTime: 6, sellRate: 65 },
      regular: { basePrice: 30, demand: "Medium", listTime: 8, sellRate: 50 }
    },
    adidas: {
      yeezy: { basePrice: 150, demand: "Very High", listTime: 1, sellRate: 95 },
      ultraboost: { basePrice: 65, demand: "High", listTime: 4, sellRate: 75 },
      regular: { basePrice: 25, demand: "Medium", listTime: 10, sellRate: 45 }
    }
  },
  golf: {
    titleist: {
      driver: { basePrice: 100, demand: "High", listTime: 7, sellRate: 70 },
      iron_set: { basePrice: 150, demand: "High", listTime: 10, sellRate: 65 },
      putter: { basePrice: 60, demand: "Medium", listTime: 12, sellRate: 55 },
      hat: { basePrice: 25, demand: "Medium", listTime: 8, sellRate: 60 },
      shoes: { basePrice: 50, demand: "Medium", listTime: 9, sellRate: 55 }
    },
    callaway: {
      driver: { basePrice: 90, demand: "High", listTime: 8, sellRate: 65 },
      iron_set: { basePrice: 130, demand: "High", listTime: 12, sellRate: 60 }
    },
    taylormade: {
      driver: { basePrice: 95, demand: "High", listTime: 7, sellRate: 70 }
    },
    footjoy: {
      shoes: { basePrice: 45, demand: "Medium", listTime: 12, sellRate: 55 }
    }
  }
};

const HIGH_VALUE_PATTERNS = {
  vintage: ['vintage', 'retro', 'classic', '80s', '90s', 'original'],
  limited: ['limited', 'edition', 'rare', 'exclusive', 'special', 'collector'],
  designer: ['gucci', 'louis vuitton', 'prada', 'chanel', 'designer', 'luxury'],
  gaming: ['pokemon', 'magic', 'collectible', 'sealed', 'mint', 'first edition']
};

function generateAdvancedMarketIntelligence(visionData) {
  const { objects, labels, logos, text } = visionData;
  const allContent = [...objects, ...labels, ...logos, text].join(' ').toLowerCase();
  
  console.log('🧠 Advanced market intelligence analyzing:', allContent);
  
  let analysis = {
    basePrice: 15,
    sellThroughRate: 40,
    avgListingTime: 15,
    demandLevel: "Low",
    seasonality: "Year-round",
    category: "Unknown Item",
    confidence: "Low"
  };

  // Brand and item detection
  let matchFound = false;
  
  // Electronics detection
  if (allContent.includes('phone') || allContent.includes('iphone')) {
    if (allContent.includes('apple') || allContent.includes('iphone')) {
      const data = BRAND_DATABASE.electronics.apple.iphone;
      analysis = { ...analysis, ...data, category: "iPhone", confidence: "High" };
      matchFound = true;
    } else if (allContent.includes('samsung')) {
      const data = BRAND_DATABASE.electronics.samsung.phone;
      analysis = { ...analysis, ...data, category: "Samsung Phone", confidence: "High" };
      matchFound = true;
    }
  }
  else if (allContent.includes('playstation') || allContent.includes('ps5') || allContent.includes('ps4')) {
    const data = BRAND_DATABASE.electronics.sony.playstation;
    analysis = { ...analysis, ...data, category: "PlayStation Console", confidence: "High" };
    matchFound = true;
  }
  else if (allContent.includes('nintendo') || allContent.includes('switch')) {
    const data = BRAND_DATABASE.electronics.nintendo.switch;
    analysis = { ...analysis, ...data, category: "Nintendo Switch", confidence: "High" };
    matchFound = true;
  }
  else if (allContent.includes('xbox')) {
    const data = BRAND_DATABASE.electronics.microsoft.xbox;
    analysis = { ...analysis, ...data, category: "Xbox Console", confidence: "High" };
    matchFound = true;
  }
  else if (allContent.includes('dyson')) {
    if (allContent.includes('vacuum')) {
      const data = BRAND_DATABASE.electronics.dyson.vacuum;
      analysis = { ...analysis, ...data, category: "Dyson Vacuum", confidence: "High" };
      matchFound = true;
    } else if (allContent.includes('hair') || allContent.includes('dryer')) {
      const data = BRAND_DATABASE.electronics.dyson.hairdryer;
      analysis = { ...analysis, ...data, category: "Dyson Hair Dryer", confidence: "High" };
      matchFound = true;
    }
  }
  
  // Shoes detection
  else if (allContent.includes('shoe') || allContent.includes('sneaker')) {
    if (allContent.includes('nike')) {
      if (allContent.includes('jordan')) {
        const data = BRAND_DATABASE.shoes.nike.jordan;
        analysis = { ...analysis, ...data, category: "Nike Jordan", confidence: "High" };
        matchFound = true;
      } else if (allContent.includes('dunk')) {
        const data = BRAND_DATABASE.shoes.nike.dunk;
        analysis = { ...analysis, ...data, category: "Nike Dunk", confidence: "High" };
        matchFound = true;
      } else {
        const data = BRAND_DATABASE.shoes.nike.regular;
        analysis = { ...analysis, ...data, category: "Nike Shoes", confidence: "Medium" };
        matchFound = true;
      }
    } else if (allContent.includes('adidas')) {
      if (allContent.includes('yeezy')) {
        const data = BRAND_DATABASE.shoes.adidas.yeezy;
        analysis = { ...analysis, ...data, category: "Adidas Yeezy", confidence: "High" };
        matchFound = true;
      } else {
        const data = BRAND_DATABASE.shoes.adidas.regular;
        analysis = { ...analysis, ...data, category: "Adidas Shoes", confidence: "Medium" };
        matchFound = true;
      }
    }
  }
  
  // Golf equipment detection - fix the detection logic
  if (allContent.includes('golf') || allContent.includes('titleist') || allContent.includes('callaway') || 
      allContent.includes('taylormade') || allContent.includes('ping')) {
    
    if (allContent.includes('titleist')) {
      if (allContent.includes('driver')) {
        const data = BRAND_DATABASE.golf.titleist.driver;
        analysis = { ...analysis, basePrice: data.basePrice, sellThroughRate: data.sellRate, 
                    avgListingTime: data.listTime, demandLevel: data.demand, 
                    category: "Titleist Driver", confidence: "High" };
        matchFound = true;
      } else if (allContent.includes('iron')) {
        const data = BRAND_DATABASE.golf.titleist.iron_set;
        analysis = { ...analysis, basePrice: data.basePrice, sellThroughRate: data.sellRate, 
                    avgListingTime: data.listTime, demandLevel: data.demand, 
                    category: "Titleist Irons", confidence: "High" };
        matchFound = true;
      } else if (allContent.includes('hat') || allContent.includes('cap') || allContent.includes('cricket cap') || allContent.includes('baseball cap')) {
        const data = BRAND_DATABASE.golf.titleist.hat;
        analysis = { ...analysis, basePrice: data.basePrice, sellThroughRate: data.sellRate, 
                    avgListingTime: data.listTime, demandLevel: data.demand, 
                    category: "Titleist Hat", confidence: "High" };
        matchFound = true;
        console.log('🎯 Matched Titleist Hat from golf database!');
      } else if (allContent.includes('shoe')) {
        const data = BRAND_DATABASE.golf.titleist.shoes;
        analysis = { ...analysis, basePrice: data.basePrice, sellThroughRate: data.sellRate, 
                    avgListingTime: data.listTime, demandLevel: data.demand, 
                    category: "Titleist Golf Shoes", confidence: "High" };
        matchFound = true;
      } else {
        // Generic Titleist item
        const data = BRAND_DATABASE.golf.titleist.hat; // Default to hat data
        analysis = { ...analysis, basePrice: data.basePrice, sellThroughRate: data.sellRate, 
                    avgListingTime: data.listTime, demandLevel: data.demand, 
                    category: "Titleist Golf Item", confidence: "Medium" };
        matchFound = true;
      }
    } else if (allContent.includes('callaway')) {
      const data = BRAND_DATABASE.golf.callaway.driver;
      analysis = { ...analysis, basePrice: data.basePrice, sellThroughRate: data.sellRate, 
                  avgListingTime: data.listTime, demandLevel: data.demand, 
                  category: "Callaway Golf Club", confidence: "High" };
      matchFound = true;
    }
  }

  // High-value pattern detection
  for (const [pattern, keywords] of Object.entries(HIGH_VALUE_PATTERNS)) {
    if (keywords.some(keyword => allContent.includes(keyword))) {
      analysis.basePrice = Math.round(analysis.basePrice * 1.5);
      analysis.sellThroughRate = Math.min(95, analysis.sellThroughRate + 15);
      analysis.avgListingTime = Math.max(2, analysis.avgListingTime - 3);
      analysis.demandLevel = "High";
      console.log(`💎 High-value pattern detected: ${pattern}`);
      break;
    }
  }

  // Condition adjustments
  if (allContent.includes('new') || allContent.includes('sealed') || allContent.includes('mint')) {
    analysis.basePrice = Math.round(analysis.basePrice * 1.3);
    analysis.sellThroughRate += 10;
  } else if (allContent.includes('used') || allContent.includes('worn') || allContent.includes('damaged')) {
    analysis.basePrice = Math.round(analysis.basePrice * 0.7);
    analysis.sellThroughRate -= 15;
  }

  // Seasonal adjustments for golf
  const currentMonth = new Date().getMonth();
  if (allContent.includes('golf')) {
    if (currentMonth >= 2 && currentMonth <= 8) {
      analysis.seasonality = "Peak Golf Season";
      analysis.sellThroughRate += 10;
      analysis.avgListingTime -= 2;
    } else {
      analysis.seasonality = "Off Season";
      analysis.sellThroughRate -= 5;
      analysis.avgListingTime += 3;
    }
  }

  // Final bounds checking
  analysis.basePrice = Math.max(5, Math.min(500, analysis.basePrice));
  analysis.sellThroughRate = Math.max(20, Math.min(95, analysis.sellThroughRate));
  analysis.avgListingTime = Math.max(2, Math.min(30, analysis.avgListingTime));

  const result = {
    avgSoldPrice: analysis.basePrice,
    sellThroughRate: analysis.sellThroughRate,
    avgListingTime: analysis.avgListingTime,
    demandLevel: analysis.demandLevel,
    seasonality: analysis.seasonality,
    totalSoldListings: `${Math.round(analysis.sellThroughRate / 1.2)} (estimated)`,
    priceRange: `${Math.round(analysis.basePrice * 0.7)} - ${Math.round(analysis.basePrice * 1.6)}`,
    confidence: analysis.confidence,
    category: analysis.category
  };

  console.log('🧠 Advanced intelligence result:', result);
  return result;
}

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'ThriftFlip Advanced Market Intelligence Backend',
    version: '2.0',
    specialties: ['Electronics', 'Shoes', 'Golf Equipment', 'High-Value Items'],
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'Advanced Intelligence System Online!',
    timestamp: new Date().toISOString(),
    apis: {
      googleVision: !!process.env.GOOGLE_VISION_API_KEY,
      marketIntelligence: true,
      specialtyCategories: ['electronics', 'shoes', 'golf', 'high-value-items']
    },
    version: '2.0'
  });
});

// Enhanced image analysis endpoint
app.post('/api/analyze-image', upload.single('image'), async (req, res) => {
  try {
    console.log('📸 Received image for advanced analysis');
    
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const base64Image = req.file.buffer.toString('base64');
    console.log('🔄 Calling Google Vision API...');

    const visionRequest = {
      requests: [
        {
          image: { content: base64Image },
          features: [
            { type: 'OBJECT_LOCALIZATION', maxResults: 15 },
            { type: 'LABEL_DETECTION', maxResults: 20 },
            { type: 'TEXT_DETECTION', maxResults: 15 },
            { type: 'LOGO_DETECTION', maxResults: 15 }
          ]
        }
      ]
    };

    let visionData = null;
    let visionError = null;

    try {
      const visionResponse = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_VISION_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(visionRequest)
        }
      );

      visionData = await visionResponse.json();
      
      if (visionData.error) {
        visionError = visionData.error.message;
        console.error('❌ Google Vision API error:', visionError);
      }
    } catch (error) {
      visionError = error.message;
      console.error('❌ Vision API call failed:', error);
    }

    // Process Google Vision results
    let category = 'Unknown Item';
    let confidence = 0;
    let detections = { objects: [], labels: [], logos: [], text: '' };

    if (visionData && !visionData.error && visionData.responses && visionData.responses[0]) {
      const annotations = visionData.responses[0];
      const objects = (annotations.localizedObjectAnnotations || []).map(o => o.name);
      const labels = (annotations.labelAnnotations || []).map(l => l.description);
      const logos = (annotations.logoAnnotations || []).map(l => l.description);
      const textDetections = annotations.textAnnotations || [];
      const fullText = textDetections.map(t => t.description).join(' ');

      detections = { objects, labels, logos, text: fullText };

      console.log('🔍 Google Vision detected:');
      console.log('Objects:', objects);
      console.log('Labels:', labels);
      console.log('Logos:', logos);
      console.log('Text:', fullText);

      // Calculate confidence from detection scores
      const allDetections = [
        ...(annotations.localizedObjectAnnotations || []).map(obj => ({ score: obj.score })),
        ...(annotations.labelAnnotations || []).map(label => ({ score: label.score })),
        ...(annotations.logoAnnotations || []).map(logo => ({ score: logo.score }))
      ];
      
      if (allDetections.length > 0) {
        const avgConfidence = allDetections.reduce((sum, det) => sum + det.score, 0) / allDetections.length;
        confidence = Math.round(avgConfidence * 100);
      }
    }

    // Generate advanced market intelligence
    const marketData = generateAdvancedMarketIntelligence(detections);
    
    // Use the category from market intelligence if it's more specific
    if (marketData.category && marketData.category !== 'Unknown Item') {
      category = marketData.category;
    } else {
      // Fallback category determination
      const { objects, labels, logos } = detections;
      if (logos.length > 0 && objects.length > 0) {
        category = `${logos[0]} ${objects[0]}`;
      } else if (logos.length > 0) {
        category = logos[0];
      } else if (objects.length > 0) {
        category = objects[0];
      } else if (labels.length > 0) {
        category = labels[0];
      }
    }

    const response = {
      category: category,
      confidence: confidence,
      searchQuery: category.toLowerCase(),
      detections: detections,
      avgSoldPrice: marketData.avgSoldPrice,
      sellThroughRate: marketData.sellThroughRate,
      avgListingTime: marketData.avgListingTime,
      demandLevel: marketData.demandLevel,
      seasonality: marketData.seasonality,
      source: visionError ? 'Advanced Market Intelligence (Vision Limited)' : 'Advanced Market Intelligence',
      totalSoldListings: marketData.totalSoldListings,
      priceRange: marketData.priceRange,
      intelligenceConfidence: marketData.confidence,
      visionError: visionError
    };

    console.log('✅ Advanced analysis complete:', {
      category: response.category,
      confidence: response.confidence,
      source: response.source,
      avgSoldPrice: response.avgSoldPrice,
      demandLevel: response.demandLevel
    });

    res.json(response);

  } catch (error) {
    console.error('❌ Error in advanced analysis:', error);
    res.status(500).json({ error: 'Advanced analysis failed: ' + error.message });
  }
});

app.listen(PORT, () => {
  console.log('🚀 ThriftFlip Advanced Intelligence Server Started!');
  console.log(`📡 Server running on port ${PORT}`);
  console.log('🔑 Google Vision API key:', !!process.env.GOOGLE_VISION_API_KEY ? 'loaded ✅' : 'missing ❌');
  console.log('🧠 Advanced Market Intelligence: enabled ✅');
  console.log('🎯 Specialties: Electronics, Shoes, Golf Equipment, High-Value Items');
  console.log('📱 Ready for advanced thrift analysis!');
  console.log('\n📋 Enhanced features:');
  console.log('   • Brand-specific pricing database');
  console.log('   • High-value pattern recognition');
  console.log('   • Seasonal market adjustments');
  console.log('   • Condition-based pricing');
  console.log('   • Thrift-focused categories');
});
