const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: '*', // Allow all origins for testing
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

// Simple test endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Thrift Flip Backend is WORKING!',
    timestamp: new Date().toISOString(),
    port: PORT
  });
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

// Image analysis endpoint - simplified for testing
app.post('/api/analyze-image', upload.single('image'), async (req, res) => {
  try {
    console.log('📸 Received image for analysis');
    
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    // For now, let's just test Google Vision API
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
            { type: 'LABEL_DETECTION', maxResults: 15 },
            { type: 'TEXT_DETECTION', maxResults: 10 },
            { type: 'LOGO_DETECTION', maxResults: 10 }
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
          headers: {
            'Content-Type': 'application/json',
          },
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

    // Process results or use intelligent fallback
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

      // Determine category
      if (logos.length > 0 && objects.length > 0) {
        category = `${logos[0]} ${objects[0]}`;
      } else if (logos.length > 0 && labels.length > 0) {
        category = `${logos[0]} ${labels[0]}`;
      } else if (logos.length > 0) {
        category = logos[0];
      } else if (objects.length > 0) {
        category = objects[0];
      } else if (labels.length > 0) {
        category = labels[0];
      }

      // Calculate confidence
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

    // Generate intelligent market data
    const marketData = generateIntelligentMarketData(category, detections);

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
      source: visionError ? 'Intelligent Market Analysis (Vision API Error)' : 'Intelligent Market Analysis',
      totalSoldListings: marketData.totalSoldListings,
      priceRange: marketData.priceRange,
      visionError: visionError
    };

    console.log('✅ Final analysis result:', {
      category: response.category,
      confidence: response.confidence,
      source: response.source,
      avgSoldPrice: response.avgSoldPrice
    });

    res.json(response);

  } catch (error) {
    console.error('❌ Error analyzing image:', error);
    res.status(500).json({ error: 'Failed to analyze image: ' + error.message });
  }
});

function generateIntelligentMarketData(category, detections) {
  const categoryLower = category.toLowerCase();
  const allContent = [
    ...detections.objects,
    ...detections.labels,
    ...detections.logos,
    detections.text
  ].join(' ').toLowerCase();
  
  console.log('🧠 Generating intelligent market analysis for:', allContent);
  
  let basePrice = 25;
  let sellThroughRate = 50;
  let avgListingTime = 15;
  let demandLevel = "Medium";
  let seasonality = "Year-round";
  
  // Brand-based pricing intelligence
  if (allContent.includes('nike') || allContent.includes('adidas') || allContent.includes('jordan')) {
    basePrice = 65;
    sellThroughRate = 75;
    avgListingTime = 7;
    demandLevel = "Very High";
  } else if (allContent.includes('titleist') || allContent.includes('callaway') || allContent.includes('ping')) {
    basePrice = 45;
    sellThroughRate = 70;
    avgListingTime = 8;
    demandLevel = "High";
  }
  
  // Category-based adjustments
  if (allContent.includes('golf')) {
    basePrice += 20;
    sellThroughRate += 15;
    seasonality = "Spring/Summer peak";
  }
  
  // Item type adjustments
  if (allContent.includes('hat') || allContent.includes('cap')) {
    basePrice = Math.max(15, basePrice - 10);
  }
  
  // Ensure reasonable bounds
  basePrice = Math.max(10, Math.min(200, basePrice));
  sellThroughRate = Math.max(25, Math.min(90, sellThroughRate));
  avgListingTime = Math.max(5, Math.min(30, avgListingTime));
  
  // Update demand level based on final sell-through rate
  if (sellThroughRate >= 75) demandLevel = "Very High";
  else if (sellThroughRate >= 60) demandLevel = "High";
  else if (sellThroughRate >= 45) demandLevel = "Medium";
  else demandLevel = "Low";
  
  const result = {
    avgSoldPrice: Math.round(basePrice),
    sellThroughRate: Math.round(sellThroughRate),
    avgListingTime: avgListingTime,
    demandLevel: demandLevel,
    seasonality: seasonality,
    totalSoldListings: `${Math.round(sellThroughRate / 2)} (estimated)`,
    priceRange: `$${Math.round(basePrice * 0.6)} - $${Math.round(basePrice * 1.8)}`
  };
  
  console.log('🧠 Intelligent analysis result:', result);
  return result;
}

app.listen(PORT, () => {
  console.log('🚀 Thrift Flip Backend Server Started!');
  console.log(`📡 Server running on port ${PORT}`);
  console.log('🔑 Google Vision API key:', !!process.env.GOOGLE_VISION_API_KEY ? 'loaded ✅' : 'missing ❌');
  console.log('🔑 eBay Client ID:', !!process.env.EBAY_CLIENT_ID ? 'loaded ✅' : 'missing ❌');
  console.log('🔑 eBay Client Secret:', !!process.env.EBAY_CLIENT_SECRET ? 'loaded ✅' : 'missing ❌');
  console.log('📱 Ready to analyze images!');
});
