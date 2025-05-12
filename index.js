import express from "express";
import cors from "cors";
import { MongoClient, ServerApiVersion } from "mongodb";
import "dotenv/config";
import jwt from "jsonwebtoken";
const app = express();
import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEYS);
// console.log(stripe)
const port = process.env.PORT || 5000;

// middlewares
app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.0goom.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );

    // create bio data collection
    const bioDataCollection = client.db("marryMatchDB").collection("biodatas");
    const successStoryCollection = client
      .db("marryMatchDB")
      .collection("successStory");
    const favoritesBioDataCollection = client
      .db("marryMatchDB")
      .collection("favoritesBiodata");
    const userCollection = client.db("marryMatchDB").collection("users");
    const premiumMemberRequestCollection = client
      .db("marryMatchDB")
      .collection("premiumRequest");
    const paymentCollection = client.db("marryMatchDB").collection("payments");

    // authentication related apis
    // create jwt method
    app.post("/jwt", async (req, res) => {
      const userInfo = req.body;
      const token = jwt.sign(userInfo, process.env.ACCESS_TOKEN, {
        expiresIn: "2h",
      });
      res.send({ token });
    });

    // custom middleware: verify token
    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      if (!token) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
        if (err) {
          return res.status(403).send({ message: "forbidden access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    // custom middleware: verify admin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded?.email;
      const query = { userEmail: email };
      const user = await userCollection.findOne(query);
      console.log(user);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // get all users for only admin and search user by username
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const search = req.query?.search;
      let query = {};
      if (search) {
        query = { userName: { $regex: search, $options: "i" } };
      }
      const users = await userCollection.find(query).toArray();
      res.send(users);
    });

    // get or check admin
    app.get("/users/admin", async (req, res) => {
      const email = req.query?.email;
      // if (email !== req.decoded?.email) {
      //   return res.status(403).send({ message: "unauthorized access" });
      // }
      const query = { userEmail: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });

    // get or check premium user
    app.get("/users/premium", async (req, res) => {
      const email = req.query?.email;
      const query = { userEmail: email };
      const user = await userCollection.findOne(query);
      let premium = false;
      if (user) {
        premium = user?.role === "premium";
      }
      res.send({ premium });
    });

    // create premium member request by user
    app.post("/users/make-premium", verifyToken, async (req, res) => {
      const userData = req.body;
      console.log(userData.email);
      // check user already existing in premium request collection
      const query = { email: userData.email };
      const user = await premiumMemberRequestCollection.findOne(query);
      if (user) {
        return res.send({
          message: "You already submit your premium biodata request!",
        });
      }
      const newRequest = await premiumMemberRequestCollection.insertOne(
        userData
      );
      res.send(newRequest);
    });

    // get premium member request for admin
    app.get("/users/premium-request", verifyToken, async (req, res) => {
      const query = { status: "pending" };
      const request = await premiumMemberRequestCollection
        .find(query)
        .toArray();
      res.send(request);
    });

    // accept request by admin
    app.patch("/users/premium-request", verifyToken, async (req, res) => {
      const { status } = req.body;
      const email = req.query?.email;

      // accept premium user request and update it
      const filter = { email: email };
      const updateStatus = {
        $set: {
          status: status,
        },
      };
      const result = await premiumMemberRequestCollection.updateOne(
        filter,
        updateStatus
      );
      res.send(result);
      // when status is rejected, return the function
      if (status !== "Approved") {
        return;
      }

      // update user role from user collection
      const query = { userEmail: email };
      const updateRole = {
        $set: {
          role: "premium",
        },
      };
      const result2 = await userCollection.updateOne(query, updateRole);

      // console.log(result);
      res.send(result2);
    });

    // make admin
    app.patch("/users/admin", verifyToken, verifyAdmin, async (req, res) => {
      const email = req.query.email;
      const filter = { userEmail: email };
      const makeAdmin = {
        $set: {
          role: "admin",
        },
      };
      const newAdmin = await userCollection.updateOne(filter, makeAdmin);
      res.send(newAdmin);
    });

    // create a normal user
    app.post("/users", async (req, res) => {
      const userData = req.body;
      // check user already existing or not existing
      const query = { userEmail: userData.userEmail };
      const user = await userCollection.findOne(query);
      if (user) {
        return res.send({ message: "User already exist!" });
      }
      const newUser = await userCollection.insertOne(userData);
      res.send(newUser);
    });

    // make premium
    app.patch("/users/premium", verifyToken, verifyAdmin, async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const updateStatus = {
        $set: {
          status: "Approved",
        },
      };
      await premiumMemberRequestCollection.updateOne(query, updateStatus);
      const filter = { userEmail: email };
      const makeAdmin = {
        $set: {
          role: "premium",
        },
      };
      const newPremium = await userCollection.updateOne(filter, makeAdmin);
      res.send(newPremium);
    });

    // get premium member bio data base of age ascending
    app.get("/premium-member", async (req, res) => {
      const sortByAge = req.query.sort;
      let sortOption = { age: 1 };
      if (sortByAge === "dsc") {
        sortOption = { age: -1 };
      }
      const query = { role: "premium" };
      const premiumMembers = await userCollection.find(query).toArray();
      const premiumMembersEmail = premiumMembers.map(
        (member) => member.userEmail
      );

      console.log(premiumMembersEmail);
      const bioData = await bioDataCollection
        .find({ email: { $in: premiumMembersEmail } })
        .sort(sortOption)
        .limit(6)
        .toArray();
      res.send(bioData);
    });

    // get all biodatas for biodatas page
    app.get("/biodata", async (req, res) => {
      const { bioDataType, division, ageFrom, ageTo } = req.query;
      let query = {};
      // filter by biodata type
      if (bioDataType) {
        query.biodataType = bioDataType;
      }

      // filter by permanentDivision
      if (division) {
        query.permanentDivision = division;
      }

      // // filter by age
      if (ageFrom && ageTo) {
        query.age = {
          $gte: parseInt(ageFrom),
          $lte: parseInt(ageTo),
        };
      } else if (ageFrom) {
        query.age = { $gte: parseInt(ageFrom) };
      } else if (ageTo) {
        query.age = { $lte: parseInt(ageTo) };
      }
      const bioData = await bioDataCollection.find(query).toArray();
      console.log(bioData);
      res.send(bioData);
    });

    // get single biodata details by id
    app.get("/biodata/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const bioId = parseInt(id);
      const query = { biodataId: bioId };
      const biodata = await bioDataCollection.findOne(query);
      // console.log(biodata)
      res.send(biodata);
    });

    // get similar biodata  for biodata details page
    app.get("/biodata/similar/:type", async (req, res) => {
      const type = req.params.type;
      const currentId = req.query.currentId;
      const query = {
        biodataType: type,
        biodataId: { $ne: parseInt(currentId) },
      };
      const similarBiodata = await bioDataCollection
        .find(query)
        .limit(3)
        .toArray();
      // console.log(similarBiodata);
      res.send(similarBiodata);
    });

    // post a biodata
    app.post("/biodata", verifyToken, async (req, res) => {
      const bioData = req.body;
      // create biodataId
      const allBioData = await bioDataCollection
        .find()
        .sort({ biodataId: -1 })
        .toArray();
      const lastBioData = allBioData[0]?.biodataId;
      const newBioDataId = lastBioData + 1;
      // create a new biodata
      const newBioData = { biodataId: newBioDataId, ...bioData };
      const result = await bioDataCollection.insertOne(newBioData);
      res.send({ result, newBioDataId });
    });

    // edit biodata
    app.patch("/biodata/:id", verifyToken, async (req, res) => {
      const id = parseInt(req.params.id);
      const filter = { biodataId: id };
      const bioData = req.body;
      const updateBioData = {
        $set: {
          biodataType: bioData.biodataType,
          name: bioData.name,
          profileImage: bioData.profileImage,
          dateOfBirth: bioData.dateOfBirth,
          height: bioData.height,
          weight: bioData.weight,
          age: bioData.age,
          occupation: bioData.occupation,
          race: bioData.race,
          fathersName: bioData.fathersName,
          mothersName: bioData.mothersName,
          permanentDivision: bioData.permanentDivision,
          presentDivision: bioData.presentDivision,
          expectedPartnerAge: bioData.expectedPartnerAge,
          expectedPartnerHeight: bioData.expectedPartnerHeight,
          expectedPartnerWeight: bioData.expectedPartnerWeight,
          mobile: bioData.mobile,
        },
      };
      const result = await bioDataCollection.updateOne(filter, updateBioData);
      res.send(result);
    });

    // view profile information by email
    app.get("/viewBiodata", verifyToken, async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const biodata = await bioDataCollection.findOne(query);
      res.send(biodata);
    });

    // get favorite biodata for logged in user
    app.get("/favoriteBiodata", verifyToken, async (req, res) => {
      const email = req.query.email;
      const query = { userEmail: email };
      const biodata = await favoritesBioDataCollection.find(query).toArray();
      res.send(biodata);
    });

    // add biodata to the favorite collection
    app.post("/favoriteBiodata", verifyToken, async (req, res) => {
      const biodata = req.body;
      const newFavoriteBiodata = await favoritesBioDataCollection.insertOne(
        biodata
      );
      res.send(newFavoriteBiodata);
    });

    // delete favourite biodata
    app.delete("/favoriteBiodata/:id", verifyToken, async (req, res) => {
      const id = parseInt(req.params.id);
      console.log(id);
      const query = { biodataId: id };
      const deleteBiodata = await favoritesBioDataCollection.deleteOne(query);
      res.send(deleteBiodata);
    });

    // get all male , female and success marriage count
    app.get("/successCount", async (req, res) => {
      const maleQuery = { biodataType: "Male" };
      const femaleQuery = { biodataType: "Female" };
      const male = await bioDataCollection.countDocuments(maleQuery);
      const female = await bioDataCollection.countDocuments(femaleQuery);
      // const marriage = await bioDataCollection.countDocuments(query);
      // TODO: get original marriage count from marriage collection
      const marriage = 2;
      res.send({ male, female, marriage });
    });

    // get all success story from our success members
    app.get("/success-story", async (req, res) => {
      const story = await successStoryCollection
        .find()
        .sort({
          marriageDate: -1,
        })
        .toArray();
      res.send(story);
    });

    // payment related apis
    // create payment intent with stripe
    app.post("/payment-intent", verifyToken, async (req, res) => {
      const data = req.body;
      const { price } = data;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // payment operation
    app.post("/payments", verifyToken, async (req, res) => {
      const paymentData = req.body;
      const paymentResult = await paymentCollection.insertOne(paymentData);
      res.send(paymentResult);
    });

    // get payment contact request for logged in user
    app.get("/payments/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { userEmail: email };
      if (email !== req.decoded?.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const payments = await paymentCollection.find(query).toArray();
      res.send(payments);
    });

    // get all payment contact request for admin,,admin can approved
    app.get("/contact-request", verifyToken, verifyAdmin, async (req, res) => {
      const query = { status: "pending" };
      const payments = await paymentCollection.find(query).toArray();
      res.send(payments);
    });

    // approved contact request : just for admin
    app.patch(
      "/approved-contact-request",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        // const { status } = req.body;
        const email = req.query?.email;

        // accept premium user request and update it
        const filter = { email: email };
        const updateStatus = {
          $set: {
            status: "Approved",
          },
        };
        const result = await paymentCollection.updateOne(filter, updateStatus);
        res.send(result);
      }
    );
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Your partner is finding");
});
app.listen(port);
