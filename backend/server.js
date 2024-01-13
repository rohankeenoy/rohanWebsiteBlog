const express = require('express');
const app = express();
const dotenv = require('dotenv');
const session = require('express-session');
const crypto = require('crypto');
const multer = require('multer');
const mongoose = require('mongoose');
const PostModel = require('./models/Post.js');
const nodemailer = require('nodemailer');

dotenv.config();
const cors = require('cors'); 
const PORT = process.env.PORT || 5000;
const expectedEmail = process.env.EMAIL;
const expectedPassword = process.env.PASSWORD;

const uri = process.env.MONGO_URI;

mongoose.connect(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;

db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => {
  console.log('Connected to MongoDB');
});

const secretKey = crypto.randomBytes(32).toString('hex');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    // Generate a unique filename for the uploaded file
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const fileExtension = file.originalname.split('.').pop();
    const filename = `photo-${uniqueSuffix}.${fileExtension}`;
    cb(null, filename);
  },
});

const upload = multer({ storage: storage });
app.use('/uploads', express.static('uploads'));


app.use(express.json());

const corsOptions = {
  origin:  ['https://rohan-keenoy.web.app', 'http://localhost:3000'],
  credentials: true,
};

app.use(cors(corsOptions));

app.use(session({
  secret: secretKey,
  resave: false,
  saveUninitialized: true,
}));

// Create a transport for sending emails
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// POST route to handle form submissions
app.post('/contact', (req, res) => {
  const { name, email, message } = req.body;

  const mailOptions = {
    from: process.env.RECIPIENT_EMAIL,
    to: process.env.RECIPIENT_EMAIL,
    subject: 'Inquiry Form Submission',
    text: `Name: ${name}\nEmail: ${email}\nMessage: ${message}`,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Error sending email:', error);
      res.status(500).json({ error: 'Error sending email' });
    } else {
      console.log('Email sent:', info.response);
      res.json({ message: 'Email sent successfully' });
    }
  });
});

function isAuthenticated(req, res, next) {
  if (req.session.isAuthenticated) {
    return next();
  }
  res.redirect('/login');
}

function isAdmin(req, res, next) {
  if (req.session.isAuthenticated && req.session.userRole === 'admin') {
    return next();
  }
  res.status(403).send('Access denied. You are not authorized to edit.');
}

app.get('/check-auth', (req, res) => {
  if (req.session.isAuthenticated) {
    res.sendStatus(200);
  } else {
    res.sendStatus(401);
  }
});

app.get('/', (req, res) => {
  res.send('Welcome to the simple authentication example!');
});

app.post('/post', upload.single('file'), async (req, res) => {
  const { title, summary, content, tags } = req.body;
  const file = req.file;

  try {
    let cover = ''; // Initialize cover as an empty string

    if (file) {
      // If a file is uploaded, set 'cover' to the generated filename
      cover = file.filename;
    }

    const newPost = new PostModel({
      title,
      summary,
      content,
      cover, // Assign the 'cover' variable to the 'cover' field
      tags: tags.split(',').map((tag) => tag.trim()),
    });

    const savedPost = await newPost.save();

    res.status(200).json({ message: 'Post created successfully', postId: savedPost._id });
  } catch (error) {
    console.error('Error creating post:', error);
    res.status(500).json({ message: 'Failed to create post' });
  }
});
// Update the route to fetch a specific blog post by ID with its content
app.get('/posts/:postId', async (req, res) => {
  const postId = req.params.postId;

  // Validate if postId is a valid ObjectId
  if (!mongoose.Types.ObjectId.isValid(postId)) {
    return res.status(400).json({ message: 'Invalid post ID' });
  }

  try {
    const post = await PostModel.findById(postId);

    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    res.status(200).json(post); // Return the entire post object including the 'content' field
  } catch (error) {
    console.error('Error fetching post:', error);
    res.status(500).json({ message: 'Failed to fetch post' });
  }
});




// Route to fetch the latest posts with pagination

// Route to fetch the latest posts with pagination
app.get('/latest-posts', async (req, res) => {
  const page = req.query.page || 1;
  const perPage = 5; // Number of posts per page

  try {
    const posts = await PostModel.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * perPage)
      .limit(perPage);

    res.status(200).json(posts);
  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).json({ message: 'Failed to fetch posts' });
  }
});

app.get('/tags', async (req, res) => {
  try {
    const uniqueTags = await PostModel.distinct('tags');
    res.status(200).json(uniqueTags);
  } catch (error) {
    console.error('Error fetching unique tags:', error);
    res.status(500).json({ message: 'Failed to fetch unique tags' });
  }
});

app.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (email === expectedEmail && password === expectedPassword) {
    req.session.isAuthenticated = true;
    req.session.userRole = 'admin';
    res.status(200).json({ message: 'Login successful' });
  } else {
    res.status(401).send('Invalid credentials');
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
