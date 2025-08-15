// server.js (or index.js)

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
dotenv.config();

const admin = require("firebase-admin");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

// CORS setup - allow your frontend origins
const corsOptions = {
  origin: ["http://localhost:5173", "http://localhost:5174"],
  credentials: true,
};
app.use(cors(corsOptions));
app.use(express.json());

// Firebase Admin Initialization
const decodedKey = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf8"
);
const serviceAccount = JSON.parse(decodedKey);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Middleware to verify Firebase ID Token
async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized, no token" });
  }
  const idToken = authHeader.split(" ")[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken; // You can access user info in routes via req.user
    next();
  } catch (err) {
    return res.status(401).json({ message: "Unauthorized, invalid token" });
  }
}

// MongoDB Setup
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: ServerApiVersion.v1,
});

async function run() {
  try {
    await client.connect();

    const db = client.db("lifenestDB");
    const policiesCollection = db.collection("policies");
    const applicationsCollection = db.collection("applications");
    const usersCollection = db.collection("users");
    const paymentsCollection = db.collection("payments");
    const blogsCollection = db.collection("blogs");

    // Add a new insurance policy (Protected)
    app.post("/policies", verifyToken, async (req, res) => {
      try {
        const policy = req.body;
        // Add validation here if needed
        const result = await policiesCollection.insertOne(policy);
        res.send({ success: true, insertedId: result.insertedId });
      } catch (error) {
        res
          .status(500)
          .send({ success: false, message: "Failed to create policy" });
      }
    });

    // Get policies with optional category filter & pagination (Public)
    app.get("/policies", async (req, res) => {
      try {
        const { category, page = 1, limit = 9 } = req.query;
        const query = category ? { category } : {};
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const limitNum = parseInt(limit);

        const policies = await policiesCollection
          .find(query)
          .skip(skip)
          .limit(limitNum)
          .toArray();
        const total = await policiesCollection.countDocuments(query);
        const categories = await policiesCollection.distinct("category");

        res.json({ policies, total, categories });
      } catch (error) {
        res.status(500).json({ message: "Failed to fetch policies" });
      }
    });

    // Get policy by ID (Public)
    app.get("/policies/:id", async (req, res) => {
      try {
        const policy = await policiesCollection.findOne({
          _id: new ObjectId(req.params.id),
        });
        if (!policy)
          return res.status(404).json({ message: "Policy not found" });
        res.send(policy);
      } catch (error) {
        res.status(500).json({ message: "Failed to fetch policy" });
      }
    });

    // Apply for Policy (Add application) (Protected)
    app.post("/applications", verifyToken, async (req, res) => {
      try {
        const application = req.body;
        // Validate application fields if needed
        const result = await applicationsCollection.insertOne(application);
        res.json({ insertedId: result.insertedId });
      } catch (error) {
        res.status(500).json({ message: "Failed to create application" });
      }
    });

    // Update application status (Protected)
    app.patch("/applications/:id/status", verifyToken, async (req, res) => {
      const { id } = req.params;
      const { status } = req.body;
      try {
        const result = await applicationsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status } }
        );
        if (result.modifiedCount === 1) {
          res.json({ success: true });
        } else {
          res.status(404).json({ message: "Application not found" });
        }
      } catch (error) {
        res
          .status(500)
          .json({ message: "Failed to update application status" });
      }
    });

    // Get applications by user email (Protected)
    app.get("/applications", verifyToken, async (req, res) => {
      try {
        const email = req.query.email;
        if (!email)
          return res.status(400).send({ message: "Email query required" });

        const applications = await applicationsCollection
          .find({ email })
          .toArray();
        res.send(applications);
      } catch (error) {
        res.status(500).send({ message: "Failed to get applications" });
      }
    });

    // Get application by ID (Protected)
    app.get("/applications/:id", verifyToken, async (req, res) => {
      try {
        const application = await applicationsCollection.findOne({
          _id: new ObjectId(req.params.id),
        });
        if (!application)
          return res.status(404).send({ message: "Application not found" });
        res.send(application);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch application" });
      }
    });

    // Delete application (Protected)
    app.delete("/applications/:id", verifyToken, async (req, res) => {
      try {
        const result = await applicationsCollection.deleteOne({
          _id: new ObjectId(req.params.id),
        });
        if (result.deletedCount === 1) {
          res.send({ success: true });
        } else {
          res
            .status(404)
            .send({ success: false, message: "Application not found" });
        }
      } catch (error) {
        res
          .status(500)
          .send({ success: false, message: "Failed to delete application" });
      }
    });

    // ✅ Add Blog Route
    // ✅ Add Blog (Protected)
    app.post("/blogs", verifyToken, async (req, res) => {
      try {
        const blog = req.body;

        // Force the author from the authenticated user
        blog.author = req.user.name || req.user.email || "Unknown Author";
        blog.publishDate = new Date();

        const result = await blogsCollection.insertOne(blog);
        res.send({ insertedId: result.insertedId });
      } catch (error) {
        console.error("Error inserting blog:", error);
        res.status(500).send({ message: "Failed to publish blog" });
      }
    });
    // ✅ Get All Blogs (Public)
    app.get("/blogs", async (req, res) => {
      try {
        const blogs = await blogsCollection
          .find()
          .sort({ publishDate: -1 }) // latest first
          .toArray();

        res.send(blogs);
      } catch (error) {
        console.error("Error fetching blogs:", error);
        res.status(500).send({ message: "Failed to fetch blogs" });
      }
    });

    // Record payment and update application status (Protected)
    app.post("/payments", verifyToken, async (req, res) => {
      try {
        const { applicationId, email, amount, paymentMethod, transactionId } =
          req.body;

        const paymentDoc = {
          applicationId: new ObjectId(applicationId),
          email,
          amount,
          paymentMethod,
          transactionId,
          paid_at: new Date(),
        };

        const paymentResult = await paymentsCollection.insertOne(paymentDoc);

        // Update application status to "paid"
        const updateResult = await applicationsCollection.updateOne(
          { _id: new ObjectId(applicationId) },
          { $set: { status: "paid" } }
        );

        if (updateResult.modifiedCount === 0) {
          return res
            .status(404)
            .json({ message: "Application not found or status update failed" });
        }

        res.status(201).json({
          success: true,
          message: "Payment recorded and application status updated to paid",
          insertedId: paymentResult.insertedId,
        });
      } catch (error) {
        console.error("Payment processing failed:", error);
        res.status(500).json({ message: "Failed to record payment" });
      }
    });

    // Get payments by applicationId or email (Protected)
    app.get("/payments", verifyToken, async (req, res) => {
      try {
        const { applicationId, email } = req.query;

        let query = {};
        if (applicationId) query.applicationId = new ObjectId(applicationId);
        else if (email) query.email = email;

        const payments = await paymentsCollection
          .find(query)
          .sort({ paid_at: -1 })
          .toArray();

        res.json(payments);
      } catch (error) {
        console.error("Error fetching payments:", error);
        res.status(500).json({ message: "Failed to get payments" });
      }
    });

    // Stripe: Create Payment Intent (Protected)
    app.post("/create-payment-intent", verifyToken, async (req, res) => {
      const amountInCents = req.body.amountInCents;
      try {
        if (!amountInCents || amountInCents <= 0) {
          return res.status(400).json({ error: "Invalid amount" });
        }
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amountInCents,
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.json({ clientSecret: paymentIntent.client_secret });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Health check route (Public)
    app.get("/", (req, res) => {
      res.send("LifeNest Insurance Server is running!");
    });

    console.log("Connected to MongoDB and ready to accept requests!");
  } catch (err) {
    console.error("Server error:", err);
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`🚀 Server is listening on port ${port}`);
});
