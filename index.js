const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
require("dotenv").config();
var jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const cors = require("cors");
const app = express();

const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());
// ????///////////

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.pyjfh6u.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
const verifyJwt = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "Unauthorized access" });
  }
  const token = authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN, (error, decoded) => {
    if (error) {
      return res
        .status(403)
        .send({ error: true, message: "Unauthorized access" });
    }
    req.decoded = decoded;

    next();
  });
};

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    client.connect();
    const userCollection = client.db("babelLinguaDB").collection("users");
    const classCollection = client.db("babelLinguaDB").collection("classes");
    const bookingCollection = client.db("babelLinguaDB").collection("bookings");
    const paymentCollection = client.db("babelLinguaDB").collection("payments");

    //
    const verifyAdmin = async (req, res, next) => {
      const { email } = req.decoded;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      if (user?.role !== "admin") {
        return res
          .status(403)
          .send({ error: true, message: "Only for admins" });
      }
      next();
    };
    // =================payments ===========

    app.post("/payments/:id", async (req, res) => {
      const classItem = req.body;
      const id = req.params.id;
      const bookId = classItem.classItem._id;
      const deleteBook = await bookingCollection.deleteOne({
        _id: new ObjectId(bookId),
      });
      const filter = { _id: new ObjectId(id) };
      const update = { $inc: { enrolled: 1, availableSeats: -1 } };
      const updateClass = await classCollection.updateOne(filter, update);

      const result = await paymentCollection.insertOne(classItem);
      res.send(result);
    });

    app.get("/payments/:email", verifyJwt, async (req, res) => {
      const email = req.params.email;

      const result = await paymentCollection.find({ email: email }).toArray();
      res.send(result);
    });
    // =============bookings route=============
    app.post("/bookings", verifyJwt, async (req, res) => {
      const bookClass = req.body.booking;
      const result = await bookingCollection.insertOne(bookClass);
      res.send(result);
    });
    app.get("/bookings/:email", verifyJwt, async (req, res) => {
      const email = req.params.email;
      const result = await bookingCollection.find({ email: email }).toArray();

      res.send(result);
    });
    app.delete("/bookings/:id", verifyJwt, async (req, res) => {
      const id = req.params.id;

      const result = await bookingCollection.deleteOne({
        _id: new ObjectId(id),
      });

      res.send(result);
    });
    //=============== classes routes here===============

    app.post("/classes", verifyJwt, async (req, res) => {
      const instructorClass = req.body;
      const result = await classCollection.insertOne(instructorClass);
      res.send(result);
    });
    app.get("/classes/approved", async (req, res) => {
      const query = { status: "approved" };
      const result = await classCollection.find(query).toArray();
      res.send(result);
    });
    app.get("/classes", async (req, res) => {
      const result = await classCollection.find().toArray();
      res.send(result);
    });

    app.get("/classes/popular", async (req, res) => {
      const result = await classCollection
        .find()
        .sort({ enrolled: -1 })
        .toArray();

      res.send(result);
    });
    // patch for update status to approve
    app.patch("/classes/:id", verifyJwt, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: "approved",
        },
      };

      const result = await classCollection.updateOne(filter, updateDoc);
      res.send(result);
    });
    app.patch("/classes/deny/:id", verifyJwt, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: "denied",
        },
      };

      const result = await classCollection.updateOne(filter, updateDoc);
      res.send(result);
    });
    app.patch("/classes/feedback/:id", verifyJwt, async (req, res) => {
      const id = req.params.id;
      const feedback = req.body.feedback;

      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          feedback: feedback,
        },
      };

      const result = await classCollection.updateOne(filter, updateDoc);
      res.send(result);
    });
    app.get("/classes/:email", verifyJwt, async (req, res) => {
      const email = req.params.email;
      const query = { instructorEmail: email };

      const result = await classCollection.find(query).toArray();
      res.send(result);
    });

    // ==========================
    // ===================user routes post
    app.post("/users", async (req, res) => {
      const user = req.body;

      const savedUser = await userCollection.findOne({ email: user.email });

      if (savedUser) {
        return res.send({ message: "User Already in database" });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });
    app.get("/users", verifyJwt, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });
    app.get("/users/instructors", async (req, res) => {
      const result = await userCollection
        .find({ role: "instructor" })
        .toArray();
      res.send(result);
    });
    app.get("/users/instructors/:id", async (req, res) => {
      const id = req.params.id;
      const result = await userCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    app.get("/user/userRole/:email", async (req, res) => {
      const email = req.params.email;

      const result = await userCollection.findOne({ email: email });

      res.send(result);
    });
    app.patch("/users/admin/:id", verifyJwt, async (req, res) => {
      const id = req.params.id;

      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "admin",
        },
      };

      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    });
    app.patch("/users/instructor/:id", verifyJwt, async (req, res) => {
      const id = req.params.id;

      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "instructor",
        },
      };

      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    //====================================== jwt route
    app.post("/jwt", (req, res) => {
      console.log(req.body);
      const { email } = req.body;

      const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // payment intend
    app.post("/create-payment-intent", async (req, res) => {
      const { amount } = req.body;

      // Create a PaymentIntent with the order amount and currency
      const paymentIntent = await stripe.paymentIntents.create({
        amount: parseInt(amount * 100),
        currency: "usd",
        automatic_payment_methods: {
          enabled: true,
        },
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Yes Server is Running! ");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
