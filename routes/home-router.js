import express from "express";
import { getHomePage } from "../contollers/home-contoller.js";

const router = express.Router();

// HOME 라우트
router.get('/', getHomePage);

export default router;