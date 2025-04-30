import express from "express";
import cors from "cors";
const app = express();
const port = process.env.PORT || 5000;

// middlewares
app.use(express.json());
app.use(cors());

app.get("/", (req, res) => {
  res.send("Your partner is finding");
});
app.listen(port);
