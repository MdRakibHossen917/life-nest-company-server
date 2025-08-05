const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const jwt = require("jsonwebtoken");
const admin = require("firebase-admin");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// ✅ Firebase Admin Initialization
const decodedKey = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf8"
);
const serviceAccount = JSON.parse(decodedKey);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// ✅ MongoDB Setup
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: ServerApiVersion.v1,
});

// ✅ JWT Middleware
// function verifyJWT(req, res, next) {
//   const authHeader = req.headers.authorization;
//   if (!authHeader)
//     return res.status(401).json({ message: "Unauthorized: No token provided" });

//   const token = authHeader.split(" ")[1];
//   jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
//     if (err)
//       return res.status(403).json({ message: "Forbidden: Invalid token" });
//     req.user = decoded;
//     next();
//   });
// }

// ✅ Main Server Logic
async function run() {
  try {
    const db = client.db("lifenestDB");
    const policiesCollection = db.collection("policies");
    const applicationsCollection = db.collection("applications");
    const usersCollection = db.collection("users");

    // Add Policy
    app.post("/policies", async (req, res) => {
      try {
        const result = await policiesCollection.insertOne(req.body);
        res.send({ success: true, insertedId: result.insertedId });
      } catch {
        res
          .status(500)
          .send({ success: false, message: "Failed to create policy" });
      }
    });

    // Get All Policies
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
      } catch {
        res.status(500).json({ message: "Failed to fetch policies" });
      }
    });

    // Get Policy by ID
    app.get("/policies/:id", async (req, res) => {
      try {
        const policy = await policiesCollection.findOne({
          _id: new ObjectId(req.params.id),
        });
        if (!policy)
          return res.status(404).json({ message: "Policy not found" });
        res.send(policy);
      } catch {
        res.status(500).json({ message: "Failed to fetch policy" });
      }
    });

    // Add User
    app.post("/users", async (req, res) => {
      try {
        const result = await usersCollection.insertOne(req.body);
        res.send({ success: true, insertedId: result.insertedId });
      } catch {
        res.status(500).send({ success: false, message: "Failed to add user" });
      }
    });

    

    // Apply for a Policy
   app.post("/applications", async (req, res) => {
     try {
       // req.body should contain { name, email, status, ... }
       const result = await applicationsCollection.insertOne(req.body);
       res.send({ insertedId: result.insertedId });
     } catch (error) {
       res.status(500).send({ message: "Failed to save application" });
     }
   });


    // Get applications by user email
 app.get("/applications", async (req, res) => {
   try {
     const email = req.query.email;
     console.log("Requested applications for email:", email);

     if (!email)
       return res.status(400).send({ message: "Email query required" });

     const applications = await applicationsCollection
       .find({ email })
       .toArray();
     console.log("Found applications:", applications.length);
     res.send(applications);
   } catch (error) {
     console.error(error);
     res.status(500).send({ message: "Failed to get applications" });
   }
 });



    // Delete Application
    app.delete("/applications/:id", async (req, res) => {
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
      } catch {
        res
          .status(500)
          .send({ success: false, message: "Failed to delete application" });
      }
    });

    app.get("/", (req, res) => {
      res.send("✅ LifeNest Insurance Server is running!");
    });
  } catch (err) {
    console.error("🔥 Server error:", err);
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`🚀 Server is listening on port ${port}`);
});
