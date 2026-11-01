import { observations } from "@/db/schema";
import { safeEqual } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    const deviceToken = req.headers.get("x-device-token");
    const envToken = process.env.DEVICE_TOKEN ?? "";

    if (!deviceToken || !safeEqual(deviceToken, envToken)) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { temperature, humidity, pressure, rain } = body;

        if (temperature === undefined || humidity === undefined) {
            return Response.json({ error: "Invalid sensor payload" }, { status: 400 });
        }

        // Insert using exact schema property names and number types
        await db.insert(observations).values({
            obsTime: new Date(),
            temperatureC: Number(temperature),
            humidityPct: Number(humidity),
            precipitationMm: rain ? 1.0 : 0.0, // Maps rain sensor state to precipitation
        });

        return Response.json({ status: "ok", message: "Observation recorded" }, { status: 200 });
    } catch (error) {
        console.error("Failed to process ESP32 data:", error);
        return Response.json(
            { status: "error", message: error instanceof Error ? error.message : "Internal Server Error" },
            { status: 500 }
        );
    }
}