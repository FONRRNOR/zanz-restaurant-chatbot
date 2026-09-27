import express from "express";
import { handleChat, getRestaurantInfo } from "../controllers/chatController.js";

const router = express.Router();

router.post("/chat", handleChat);
router.get("/restaurant/:id", getRestaurantInfo);

export default router;