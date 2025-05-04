import express from "express";
import cors from "cors";
import { MongoClient, ServerApiVersion } from "mongodb";
import "dotenv/config";
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

    // get premium member bio data base of age ascending
    app.get("/premium-member", async (req, res) => {
      const sortByAge = req.query.sort;
      // console.log(sortByAge);
      let sortOption = { age: 1 };
      if (sortByAge === "dsc") {
        sortOption = { age: -1 };
      }
      const bioData = await bioDataCollection.find().sort(sortOption).limit(6).toArray();
      res.send(bioData);
    });

    // get all biodatas for biodatas page
    app.get("/all-biodata", async (req, res) => {
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

    // view profile information by email
    app.get("/viewBiodata", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const biodata = await bioDataCollection.findOne(query);
      res.send(biodata);
    });


    // add biodata to the favorite collection
    app.post("/favoriteBiodata", async (req, res) => {
      const biodata = req.body;
      const newFavoriteBiodata = await favoritesBioDataCollection.insertOne(biodata);
      res.send(newFavoriteBiodata)
    })

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
