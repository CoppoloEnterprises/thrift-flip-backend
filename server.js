const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

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
  
  // Get the highest confidence detection as primary category
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
  
  // Clothing
  if (allContent.includes('jacket') || allContent.includes('coat') || allContent.includes('leather')) {
    return 'Vintage Leather Jacket';
  }
  if (allContent.includes('shoe') || allContent.includes('sneaker') || allContent.includes('boot')) {
    return 'Athletic Sneakers';
  }
  if (allContent.includes('shirt') || allContent.includes('t-shirt')) {
    return 'Vintage T-Shirt';
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
  if (allContent.includes('headphones') || allContent.includes('headphone')) {
    return 'Headphones';
  }
  if (allContent.includes('calculator')) {
    return 'Calculator';
  }
  if (allContent.includes('typewriter')) {
    return 'Typewriter';
  }
  
  // Accessories
  if (allContent.includes('bag') || allContent.includes('purse') || allContent.includes('handbag')) {
    return 'Handbag';
  }
  if (allContent.includes('watch')) {
    return 'Watch';
  }
  if (allContent.includes('jewelry') || allContent.includes('necklace') || allContent.includes('ring')) {
    return 'Jewelry';
  }
  
  // Books & Media
  if (allContent.includes('book') || allContent.includes('novel')) {
    return 'Book';
  }
  if (allContent.includes('vinyl') || allContent.includes('record')) {
    return 'Vinyl Record';
  }
  if (allContent.includes('cd') || allContent.includes('compact disc')) {
    return 'Music CD';
  }
  
  // Home & Decor
  if (allContent.includes('vase') || allContent.includes('pottery')) {
    return 'Vase';
  }
  if (allContent.includes('lamp') || allContent.includes('lighting')) {
    return 'Lamp';
  }
  if (allContent.includes('mirror')) {
    return 'Mirror';
  }
  if (allContent.includes('clock')) {
    return 'Clock';
  }
  
  // Toys & Games
  if (allContent.includes('toy') || allContent.includes('doll')) {
    return 'Toy';
  }
  if (allContent.includes('game') || allContent.includes('board game')) {
    return 'Board Game';
  }
  if (allContent.includes('puzzle')) {
    return 'Puzzle';
  }
  
  // Tools & Equipment
  if (allContent.includes('tool') || allContent.includes('wrench') || allContent.includes('hammer')) {
    return 'Tools';
  }
  
  // Kitchenware
  if (allContent.includes('pot') || allContent.includes('pan') || allContent.includes('cookware')) {
    return 'Cookware';
  }
  if (allContent.includes('blender') || allContent.includes('mixer')) {
    return 'Kitchen Appliance';
  }
  
  // If no specific category matches, use the most confident Google Vision result
  // Capitalize first letter and make it more marketable
  const capitalizedPrimary = primaryDetection.charAt(0).toUpperCase() + primaryDetection.slice(1);
  
  // Only add "Vintage" prefix for items that are actually likely to be vintage/collectible
  // and only if they're clearly old items (typewriters, certain electronics, etc.)
  const definiteVintageItems = ['typewriter', 'rotary phone', 'gramophone'];
  const shouldAddVintage = definiteVintageItems.some(item => allContent.includes(item));
  
  if (shouldAddVintage && !capitalizedPrimary.includes('Vintage')) {
    return `Vintage ${capitalizedPrimary}`;
  }
  
  return capitalizedPrimary;
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'Server is running!',
    timestamp: new Date().toISOString()
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
  console.log('🔑 Google Vision API key loaded');
  console.log('📱 Ready to analyze images!');
  console.log('\n📋 Available endpoints:');
  console.log(`   Health check: http://localhost:${PORT}/api/health`);
  console.log(`   Image analysis: http://localhost:${PORT}/api/analyze-image`);
});
