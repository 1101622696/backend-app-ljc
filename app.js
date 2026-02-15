import express from "express";
import 'dotenv/config';
import dbConexion from "./database/cnxmongoose.js";
import cors from "cors";
import usuarios from "./routes/usuarios.js"
import solicitudes from "./routes/solicitudes.js"
import pilotos from "./routes/pilotos.js"
import prevuelos from "./routes/prevuelos.js"
import postvuelos from "./routes/postvuelos.js"
import mantenimiento from "./routes/mantenimiento.js"
import { firebaseHelper } from "./helpers/firebase.js";
import health from "./routes/health.js"

const app = express();

firebaseHelper.initializeFirebaseAdmin();

const whitelist = ['https://localhost','http://localhost:9000', 'http://localhost', 'http://localhost:3000', 'capacitor://localhost', 'ionic://localhost'];
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || whitelist.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
};

app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/usuarios",usuarios)
app.use("/api/mantenimiento",mantenimiento)
app.use("/api/postvuelos",postvuelos)
app.use("/api/prevuelos",prevuelos)
app.use("/api/pilotos",pilotos)
app.use("/api/solicitudes",solicitudes)
app.use("/api/health", health)

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`Servidor escuchando en el puerto ${PORT}`);
    dbConexion();
});

export default app;