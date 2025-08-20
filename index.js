const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
dotenv.config();

const admin = require("firebase-admin");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

const corsOptions = {
  origin: ["http://localhost:5173", "http://localhost:5174"],
  credentials: true,
};
app.use(cors(corsOptions));
app.use(express.json());

const decodedKey = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf8"
);
const serviceAccount = JSON.parse(decodedKey);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: ServerApiVersion.v1,
});

async function run() {
  try {

    const db = client.db("lifenestDB");
    const collections = {
      policies: db.collection("policies"),
      applications: db.collection("applications"),
      users: db.collection("users"),
      payments: db.collection("payments"),
      blogs: db.collection("blogs"),
      agents: db.collection("agents"),
      newsletterSubscribers: db.collection("newsletterSubscribers"),
      purchases: db.collection("purchases"),
    };

    const verifyJWT = async (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).send({ message: "Unauthorized" });

      const token = authHeader.split(" ")[1];
      try {
        const decoded = await admin.auth().verifyIdToken(token);
        req.user = decoded;
        next();
      } catch (err) {
        console.error(err);
        res.status(403).send({ message: "Forbidden" });
      }
    };
    const verifyToken = async (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Unauthorized, no token" });
      }
      const idToken = authHeader.split(" ")[1];
      try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        req.user = decodedToken;
        next();
      } catch (err) {
        return res.status(401).json({ message: "Unauthorized, invalid token" });
      }
    };

    const verifyAdmin = async (req, res, next) => {
      try {
        const user = await collections.users.findOne({ email: req.user.email });
        if (!user || user.role !== "admin") {
          return res
            .status(403)
            .send({ message: "Forbidden: Admin access required" });
        }
        next();
      } catch (err) {
        console.error(err);
        res
          .status(500)
          .json({ message: "Server error during admin verification" });
      }
    };

    const verifyAgent = async (req, res, next) => {
      try {
        const user = await collections.users.findOne({ email: req.user.email });
        if (!user || user.role !== "agent") {
          return res
            .status(403)
            .send({ message: "Forbidden: Agent access required" });
        }
        next();
      } catch (err) {
        console.error(err);
        res
          .status(500)
          .json({ message: "Server error during agent verification" });
      }
    };

    app.get("/", (req, res) => {
      res.send("LifeNest Insurance Server is running!");
    });

    app.post("/policies", async (req, res) => {
      try {
        const policy = req.body;
        const result = await collections.policies.insertOne(policy);
        res.status(201).json({ success: true, insertedId: result.insertedId });
      } catch (error) {
        console.error(error);
        res
          .status(500)
          .json({ success: false, message: "Failed to create policy" });
      }
    });

    app.get("/policies", async (req, res) => {
      try {
        const { category, page = 1, limit = 9 } = req.query;
        const query = category ? { category } : {};
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const limitNum = parseInt(limit);

        const [policies, total, categories] = await Promise.all([
          collections.policies.find(query).skip(skip).limit(limitNum).toArray(),
          collections.policies.countDocuments(query),
          collections.policies.distinct("category"),
        ]);

        res.json({ policies, total, categories });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to fetch policies" });
      }
    });

    app.get("/policies/6", async (req, res) => {
      try {
        const policies = await collections.policies.find({}).limit(6).toArray();
        res.json(policies);
      } catch (error) {
        console.error("Error fetching 6 policies:", error);
        res.status(500).json({ error: "Failed to fetch policies" });
      }
    });

    app.get("/policies/:id", async (req, res) => {
      try {
        const policy = await collections.policies.findOne({
          _id: new ObjectId(req.params.id),
        });
        if (!policy) {
          return res.status(404).json({ message: "Policy not found" });
        }
        res.json(policy);
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to fetch policy" });
      }
    });

    app.patch("/policies/:id", async (req, res) => {
      try {
        const policyId = req.params.id;
        const updateData = req.body;

        const result = await collections.policies.updateOne(
          { _id: new ObjectId(policyId) },
          { $set: updateData }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ message: "Policy not found" });
        }

        res.json({ success: true, message: "Policy updated successfully" });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to update policy" });
      }
    });

    app.delete("/policies/:id", async (req, res) => {
      try {
        const policyId = req.params.id;
        const result = await collections.policies.deleteOne({
          _id: new ObjectId(policyId),
        });

        if (result.deletedCount === 0) {
          return res.status(404).json({ message: "Policy not found" });
        }

        res.json({ success: true, message: "Policy deleted successfully" });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to delete policy" });
      }
    });

    app.get("/users/role", async (req, res) => {
      try {
        const email = req.query.email;
        if (!email)
          return res.status(400).json({ message: "Email is required" });

        const user = await collections.users.findOne({ email });
        if (!user) return res.status(404).json({ message: "User not found" });

        res.json({ role: user.role || "user" });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
      }
    });

    app.get("/users/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const user = await collections.users.findOne({ email });
        if (!user) return res.status(404).json({ message: "User not found" });
        res.json(user);
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
      }
    });

    app.get("/users", async (req, res) => {
      try {
        const email = req.query.email;
        if (!email) {
          return res.status(400).json({ message: "Email is required" });
        }

        const userProfile = await collections.users.findOne({ email });
        res.json(userProfile || {});
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to fetch user" });
      }
    });
    app.get("/agents/all", async (req, res) => {
      try {
        const agents = await collections.agents.find({}).toArray();
        res.json(agents); 
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to fetch agents" });
      }
    });
    app.get("/users/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const user = await collections.users.findOne({ email });
        if (!user) return res.status(404).json({ message: "User not found" });
        res.json(user);
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
      }
    });
    app.post("/users", async (req, res) => {
      try {
        const userData = req.body;

        if (!userData.email || !userData.name) {
          return res
            .status(400)
            .json({ message: "Name and Email are required" });
        }

        if (!userData.role) {
          userData.role = "user";
        }

        const result = await collections.users.updateOne(
          { email: userData.email },
          { $set: userData },
          { upsert: true }
        );

        res.status(200).json({ success: true, data: userData });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to create or update user" });
      }
    });

    app.patch("/users/:email", verifyToken, async (req, res) => {
      try {
        const email = req.params.email;
        const updateData = req.body;

        if (req.user.email !== email && req.user.role !== "admin") {
          return res.status(403).json({ message: "Forbidden" });
        }

        const result = await collections.users.updateOne(
          { email },
          { $set: updateData }
        );

        if (result.modifiedCount === 1) {
          res.json({ success: true });
        } else {
          res.status(404).json({ success: false, message: "User not found" });
        }
      } catch (err) {
        console.error(err);
        res
          .status(500)
          .json({ success: false, message: "Failed to update user" });
      }
    });
    app.put("/make-admin", async (req, res) => {
      const { email } = req.body;
      if (!email) return res.status(400).json({ message: "Email is required" });

      try {
        const result = await collections.users.updateOne(
          { email },
          { $set: { role: "admin" } }
        );

        if (result.modifiedCount > 0) {
          res.json({ message: `${email} is now an admin.` });
        } else {
          res
            .status(404)
            .json({ message: "User not found or already an admin" });
        }
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    app.post("/agents", verifyToken, async (req, res) => {
      console.log("Headers received:", req.headers);
      try {
        const agentData = req.body;

        if (!agentData.name || !agentData.email || !agentData.district) {
          return res
            .status(400)
            .json({ message: "Name, Email & District are required" });
        }

        const existingAgent = await collections.agents.findOne({
          email: agentData.email,
        });
        if (existingAgent) {
          return res.status(409).json({
            success: false,
            message: "You have already submitted an agent request",
          });
        }

        agentData.status = "pending";
        agentData.created_at = new Date();
        agentData.requestedBy = req.user.email;

        const result = await collections.agents.insertOne(agentData);
        res.status(201).json({
          success: true,
          message: "Agent request submitted",
          insertedId: result.insertedId,
        });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to submit agent request" });
      }
    });

    app.get("/agents", async (req, res) => {
      try {
        const limit = parseInt(req.query.limit) || 3; 
        const query = { status: "approved" };

        const agents = await collections.agents
          .find(query)
          .limit(limit)
          .toArray();

        res.json({
          success: true,
          data: agents,
        });
      } catch (err) {
        console.error(err);
        res
          .status(500)
          .json({ success: false, message: "Failed to fetch agents" });
      }
    });

    app.get("/agents/all", async (req, res) => {
      try {
        const agents = await collections.agents.find({}).toArray();
        res.json({
          success: true,
          data: agents,
        });
      } catch (err) {
        console.error(err);
        res.status(500).json({
          success: false,
          message: "Failed to fetch agents",
        });
      }
    });

    app.patch("/agents/:id/status", async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body;

        if (!["approved", "pending", "disapproved"].includes(status)) {
          return res
            .status(400)
            .json({ success: false, message: "Invalid status value" });
        }

        const result = await collections.agents.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status } }
        );

        if (result.modifiedCount === 1) {
          res.json({ success: true, message: "Agent status updated" });
        } else {
          res.status(404).json({ success: false, message: "Agent not found" });
        }
      } catch (err) {
        console.error(err);
        res
          .status(500)
          .json({ success: false, message: "Failed to update agent" });
      }
    });

    app.delete("/agents/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const result = await collections.agents.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 1) {
          res.json({
            success: true,
            message: "Agent deleted successfully",
          });
        } else {
          res.status(404).json({
            success: false,
            message: "Agent not found",
          });
        }
      } catch (err) {
        console.error(err);
        res.status(500).json({
          success: false,
          message: "Failed to delete agent",
        });
      }
    });

    app.get("/all", verifyJWT, async (req, res) => {
      const applications = await db.collection("applications").find().toArray();
      res.send(applications);
    });

    app.patch("/assign/:id", verifyJWT, async (req, res) => {
      const { agentEmail } = req.body;
      const id = req.params.id;
      const result = await db
        .collection("applications")
        .updateOne(
          { _id: new ObjectId(id) },
          { $set: { assignedAgent: agentEmail, status: "Assigned" } }
        );
      res.send(result);
    });

    app.get("/applications/assigned/:agentEmail", async (req, res) => {
      try {
        const { agentEmail } = req.params;

        if (!agentEmail) {
          return res.status(400).json({ error: "Agent email missing" });
        }

        const assignedCustomers = await collections.applications
          .find({ assignedAgent: agentEmail })
          .toArray();

        res.json(assignedCustomers);
      } catch (err) {
        console.error("Error fetching assigned customers:", err);
        res.status(500).json({ error: "Server error" });
      }
    });

    app.patch("/applications/assign/:id", async (req, res) => {
      try {
        const appId = req.params.id;
        const { agentEmail } = req.body;

        if (!agentEmail) {
          return res.status(400).json({ message: "Agent email is required" });
        }

        const agent = await collections.users.findOne({
          email: agentEmail,
          role: "agent",
        });

        if (!agent) {
          return res.status(404).json({ message: "Agent not found" });
        }

        const result = await collections.applications.updateOne(
          { _id: new ObjectId(appId) },
          {
            $set: {
              assignedAgent: agentEmail,
              status: "Assigned",
              assignedAt: new Date(),
            },
          }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ message: "Application not found" });
        }

        res.json({
          success: true,
          message: "Agent assigned successfully",
          modifiedCount: result.modifiedCount,
        });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to assign agent" });
      }
    });

    app.patch(
      "/applications/reject/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const result = await collections.applications.updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: { status: "Rejected", rejectedAt: new Date() } }
          );

          if (result.matchedCount === 0) {
            return res.status(404).json({ message: "Application not found" });
          }

          res.json({
            success: true,
            message: "Application rejected",
            modifiedCount: result.modifiedCount,
          });
        } catch (err) {
          console.error(err);
          res.status(500).json({ message: "Failed to reject application" });
        }
      }
    );

    app.post("/applications", verifyToken, async (req, res) => {
      try {
        const application = req.body;
        application.userEmail = req.user.email;
        application.status = "pending";
        application.applicationDate = new Date();

        const result = await collections.applications.insertOne(application);
        res.status(201).json({ insertedId: result.insertedId });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to create application" });
      }
    });

    app.patch(
      "/applications/:id/status",
      verifyToken,
      verifyAgent,
      async (req, res) => {
        try {
          const { id } = req.params;
          const { status } = req.body;

          const application = await collections.applications.findOne({
            _id: new ObjectId(id),
            assignedAgent: req.user.email,
          });

          if (!application) {
            return res.status(404).json({
              success: false,
              message: "Application not found or not assigned to you",
            });
          }

          const result = await collections.applications.updateOne(
            { _id: new ObjectId(id) },
            { $set: { status } }
          );

          if (result.modifiedCount === 1) {
            res.json({
              success: true,
              message: "Application status updated successfully",
            });
          } else {
            res
              .status(404)
              .json({ success: false, message: "Application not found" });
          }
        } catch (error) {
          console.error(error);
          res.status(500).json({
            success: false,
            message: "Failed to update application status",
          });
        }
      }
    );
    app.get("/applications", verifyToken, async (req, res) => {
      try {
        const email = req.query.email || req.user.email;
        if (!email) {
          return res.status(400).json({ message: "Email is required" });
        }

        if (email !== req.user.email && req.user.role !== "admin") {
          return res.status(403).json({ message: "Forbidden" });
        }

        const applications = await collections.applications
          .find({ userEmail: email })
          .toArray();
        res.json(applications);
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to get applications" });
      }
    });

    app.get("/applications/all", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const applications = await collections.applications.find().toArray();
        res.json(applications);
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to fetch applications" });
      }
    });

    app.get("/applications/:id", verifyToken, async (req, res) => {
      try {
        const application = await collections.applications.findOne({
          _id: new ObjectId(req.params.id),
        });

        if (!application) {
          return res.status(404).json({ message: "Application not found" });
        }

        if (
          application.userEmail !== req.user.email &&
          req.user.role !== "admin"
        ) {
          return res.status(403).json({ message: "Forbidden" });
        }

        res.json(application);
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to fetch application" });
      }
    });

    app.delete("/applications/:id", verifyToken, async (req, res) => {
      try {
        const application = await collections.applications.findOne({
          _id: new ObjectId(req.params.id),
        });

        if (!application) {
          return res.status(404).json({ message: "Application not found" });
        }

        if (
          application.userEmail !== req.user.email &&
          req.user.role !== "admin"
        ) {
          return res.status(403).json({ message: "Forbidden" });
        }

        const result = await collections.applications.deleteOne({
          _id: new ObjectId(req.params.id),
        });

        res.json({ success: true });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to delete application" });
      }
    });

    app.post("/create-payment-intent", verifyToken, async (req, res) => {
      try {
        const { amountInCents } = req.body;
        if (!amountInCents || amountInCents <= 0) {
          return res.status(400).json({ message: "Invalid amount" });
        }

        const paymentIntent = await stripe.paymentIntents.create({
          amount: amountInCents,
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.json({ clientSecret: paymentIntent.client_secret });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: err.message });
      }
    });

    app.post("/payments/save", verifyToken, async (req, res) => {
      try {
        const { amount, transactionId, applicationId } = req.body;
        if (!amount || !transactionId || !applicationId) {
          return res.status(400).json({ message: "All fields required" });
        }

        const paymentData = {
          email: req.user.email,
          amount: Number(amount),
          transactionId,
          applicationId: new ObjectId(applicationId),
          paid_at: new Date(),
          status: "success",
        };

        const [paymentResult] = await Promise.all([
          collections.payments.insertOne(paymentData),
          collections.applications.updateOne(
            { _id: new ObjectId(applicationId) },
            { $set: { status: "paid" } }
          ),
        ]);

        res.status(201).json({
          success: true,
          insertedId: paymentResult.insertedId,
        });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Payment save failed" });
      }
    });

    app.get("/payments", verifyToken, async (req, res) => {
      try {
        const payments = await collections.payments
          .find({ email: req.user.email })
          .sort({ paid_at: -1 })
          .toArray();
        res.json(payments);
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to fetch payments" });
      }
    });

    app.get("/payments/all", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const payments = await collections.payments
          .aggregate([
            {
              $lookup: {
                from: "applications",
                localField: "applicationId",
                foreignField: "_id",
                as: "application",
              },
            },
            { $unwind: "$application" },
            {
              $lookup: {
                from: "policies",
                localField: "application.policyId",
                foreignField: "_id",
                as: "policy",
              },
            },
            { $unwind: "$policy" },
            {
              $project: {
                _id: 1,
                transactionId: 1,
                email: 1,
                amount: 1,
                paid_at: 1,
                status: 1,
                policyName: "$policy.title",
                applicantName: "$application.aname",
              },
            },
            { $sort: { paid_at: -1 } },
          ])
          .toArray();

        res.json(payments);
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to fetch all payments" });
      }
    });

    app.post("/blogs", verifyToken, verifyAgent, async (req, res) => {
      try {
        const blog = req.body;
        blog.authorEmail = req.user.email;
        blog.authorName = req.user.name || req.user.email;
        blog.publishDate = new Date();

        const result = await collections.blogs.insertOne(blog);
        res.status(201).json({ success: true, insertedId: result.insertedId });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to create blog" });
      }
    });

    app.get("/blogs", verifyToken, async (req, res) => {
      try {
        const user = await collections.users.findOne({ email: req.user.email });
        let query = {};

        if (user.role === "agent") {
          query = { authorEmail: req.user.email };
        }

        const blogs = await collections.blogs
          .find(query)
          .sort({ publishDate: -1 })
          .toArray();
        res.json(blogs);
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to fetch blogs" });
      }
    });

    app.get("/blogs/:id", verifyToken, async (req, res) => {
      try {
        const blogId = req.params.id;
        const blog = await collections.blogs.findOne({
          _id: new ObjectId(blogId),
        });

        if (!blog) {
          return res.status(404).json({ message: "Blog not found" });
        }

        res.json(blog);
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to fetch blog" });
      }
    });

    app.delete("/blogs/:id", verifyToken, verifyAgent, async (req, res) => {
      try {
        const blogId = req.params.id;

        const blog = await collections.blogs.findOne({
          _id: new ObjectId(blogId),
        });
        if (!blog) return res.status(404).json({ message: "Blog not found" });
        if (blog.authorEmail !== req.user.email)
          return res
            .status(403)
            .json({ message: "Forbidden: Cannot delete others' blogs" });

        await collections.blogs.deleteOne({ _id: new ObjectId(blogId) });
        res.json({ success: true, message: "Blog deleted successfully" });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to delete blog" });
      }
    });

    app.get("/blogs/latest", async (req, res) => {
      try {
        const latestBlogs = await collections.blogs
          .find()
          .sort({ publishDate: -1 })
          .limit(4)
          .toArray();
        res.json(latestBlogs);
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to fetch latest blogs" });
      }
    });

    app.get("/admin-stats", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const [
          totalUsers,
          totalAgents,
          totalPolicies,
          totalApplications,
          pendingApplications,
          approvedApplications,
          totalPayments,
        ] = await Promise.all([
          collections.users.countDocuments(),
          collections.agents.countDocuments(),
          collections.policies.countDocuments(),
          collections.applications.countDocuments(),
          collections.applications.countDocuments({ status: "pending" }),
          collections.applications.countDocuments({ status: "approved" }),
          collections.payments.countDocuments(),
        ]);

        res.json({
          totalUsers,
          totalAgents,
          totalPolicies,
          totalApplications,
          pendingApplications,
          approvedApplications,
          totalPayments,
        });
      } catch (err) {
        console.error("Error fetching admin stats:", err);
        res.status(500).json({ message: "Failed to fetch admin statistics" });
      }
    });

    app.post("/subscribe", async (req, res) => {
      try {
        const { name, email } = req.body;

        if (!name || !email) {
          return res
            .status(400)
            .json({ message: "Name and email are required" });
        }

        const existingSubscriber =
          await collections.newsletterSubscribers.findOne({ email });
        if (existingSubscriber) {
          return res
            .status(409)
            .json({ message: "This email is already subscribed" });
        }

        const newSubscriber = {
          name,
          email,
          subscribedAt: new Date(),
          active: true,
        };

        const result = await collections.newsletterSubscribers.insertOne(
          newSubscriber
        );
        res.status(201).json({
          success: true,
          message: "Thank you for subscribing!",
          subscriberId: result.insertedId,
        });
      } catch (error) {
        console.error("Subscription error:", error);
        res.status(500).json({ message: "Failed to process subscription" });
      }
    });

    console.log("Connected to MongoDB and ready to accept requests!");
  } catch (err) {
    console.error("Server error:", err);
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
