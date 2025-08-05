const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
const uri = process.env.MONGODB_URI;  
const client = new MongoClient(uri, {
  serverApi: ServerApiVersion.v1,
});

async function run() {
  try {
    await client.connect();
    const db = client.db("lifenestDB");
    const policiesCollection = db.collection("policies");

    // 🔸 POST /policies → Add a new policy
    app.post("/policies", async (req, res) => {
      try {
        const newPolicy = req.body;
        const result = await policiesCollection.insertOne(newPolicy);
        res.send({ success: true, insertedId: result.insertedId });
      } catch (err) {
        console.error("Error creating policy:", err);
        res
          .status(500)
          .send({ success: false, message: "Failed to create policy" });
      }
    });

    // 🔸 GET /policies → Fetch all policies with optional filter + pagination
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

        res.json({
          policies,
          total,
          categories,
        });
      } catch (err) {
        console.error("Error fetching policies:", err);
        res.status(500).json({ message: "Failed to fetch policies" });
      }
    });

    // 🔸 GET /policies/:id → Fetch policy details by ID
    app.get("/policies/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const policy = await policiesCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!policy) {
          return res.status(404).json({ message: "Policy not found" });
        }

        res.send(policy);
      } catch (err) {
        console.error("Error fetching policy:", err);
        res.status(500).json({ message: "Failed to fetch policy" });
      }
    });

    // Optional test route
    app.get("/", (req, res) => {
      res.send("LifeNest Insurance Server is running!");
    });
  } catch (err) {
    console.error(err);
  }
}

run();

// Start server
app.listen(port, () => {
  console.log(`🚀 Server is running on http://localhost:${port}`);
});
