import express from "express";
import cors from "cors";
import { MongoClient, ServerApiVersion } from "mongodb";
import "dotenv/config";
import jwt from "jsonwebtoken";
const app = express();
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

    // authentication related apis
    // create jwt method
    app.post("/jwt", async (req, res) => {
      const userInfo = req.body;
      const token = jwt.sign(userInfo, process.env.ACCESS_TOKEN, {
        expiresIn: '2h'
      });
      res.send({token})
    })

        // custom middleware: verify token
        const verifyToken = (req, res, next) => {
          // console.log("inside the verify token",req.headers.authorization);
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

    // get all users for only admin and search user by username
    app.get("/users", async (req, res) => {
      const search = req.query.search;
      let query = {};
      if (search) {
        query = { userName: { $regex: search, $options: "i" } };
      }
      const users = await userCollection.find(query).toArray();
      res.send(users);
    });

    // make admin
    app.patch("/users/admin", async (req, res) => {
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

    // get or check admin
    app.get("/users/admin", async (req, res) => {
      const email = req.query.email;
      const query = { userEmail: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin"
      }
      res.send({admin})
    })

    // create a normal user
    app.post("/users", async (req, res) => {
      const userData = req.body;
      // check user already existing or not existing
      const query = { userEmail: userData.userEmail };
      const user = await userCollection.findOne(query);
      if (user) {
        return res.send({message: "User already exist!"})
      }
      const newUser = await userCollection.insertOne(userData)
      res.send(newUser)
    })

    // make premium
    app.patch("/users/premium", async (req, res) => {
      const email = req.query.email;
      const filter = { userEmail: email };
      const makeAdmin = {
        $set: {
          role: "premium",
        },
      };
      const newAdmin = await userCollection.updateOne(filter, makeAdmin);
      res.send(newAdmin);
    });

    // get premium member bio data base of age ascending
    app.get("/premium-member", async (req, res) => {
      const sortByAge = req.query.sort;
      // console.log(sortByAge);
      let sortOption = { age: 1 };
      if (sortByAge === "dsc") {
        sortOption = { age: -1 };
      }
      const bioData = await bioDataCollection
        .find()
        .sort(sortOption)
        .limit(6)
        .toArray();
      res.send(bioData);
    });

    // get all biodatas for biodatas page
    app.get("/biodata", async (req, res) => {
      const { bioDataType, division, ageFrom, ageTo } = req.query;
      let query = {};
      if (bioDataType) {
        query.bioDataType = bioDataType;
      }
      const bioData = await bioDataCollection.find(query).toArray();
      res.send(bioData);
    });

    // get single biodata details by id
    app.get("/biodata/:id", async (req, res) => {
      const id = req.params.id;
      const bioId = parseInt(id);
      const query = { biodataId: bioId };
      const biodata = await bioDataCollection.findOne(query);
      res.send(biodata);
    });

    // post a biodata
    app.post("/biodata", async (req, res) => {
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
    app.patch("/biodata/:id", async (req, res) => {
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
    app.get("/viewBiodata", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const biodata = await bioDataCollection.findOne(query);
      res.send(biodata);
    });

    // get favorite biodata for logged in user
    app.get("/favoriteBiodata", async (req, res) => {
      const email = req.query.email;
      const query = { userEmail: email };
      const biodata = await favoritesBioDataCollection.find(query).toArray();
      res.send(biodata);
    });

    // add biodata to the favorite collection
    app.post("/favoriteBiodata", async (req, res) => {
      const biodata = req.body;
      const newFavoriteBiodata = await favoritesBioDataCollection.insertOne(
        biodata
      );
      res.send(newFavoriteBiodata);
    });

    // delete favourite biodata
    app.delete("/favoriteBiodata/:id", async (req, res) => {
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
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Your partner is finding");
});
app.listen(port);
