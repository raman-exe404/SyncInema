import { Router } from "express";
import { createRoomHandler, getRoom, getRoomMessages } from "../controllers/room.controller";

const router = Router();

// POST /rooms — create a private room, returns the six-character code.
router.post("/rooms", createRoomHandler);
// GET /rooms/:code — validate a code / fetch room snapshot.
router.get("/rooms/:code", getRoom);
// GET /rooms/:code/messages — recent chat history (participants only in prod RLS).
router.get("/rooms/:code/messages", getRoomMessages);

export default router;
