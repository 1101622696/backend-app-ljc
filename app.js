import express from "express";
import 'dotenv/config';
import dbConexion from "./database/cnxmongoose.js";
import cors from "cors";
import usuarios from "./routes/usuarios.js"
import solicitudes from "./routes/solicitudes.js"
import vehiculos from "./routes/vehiculos.js"
import clientes from "./routes/clientes.js"
import preoperacionales from "./routes/preoperacionales.js"
import viajes from "./routes/viajes.js"
import mantenimientos from "./routes/mantenimientos.js"
import prestamos from "./routes/prestamos.js"
import combustible from "./routes/combustible.js"
import gastos from "./routes/gastos.js"
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
app.use("/api/mantenimientos",mantenimientos)
app.use("/api/vehiculos",vehiculos)
app.use("/api/clientes",clientes)
app.use("/api/solicitudes",solicitudes)
app.use("/api/preoperacionales",preoperacionales)
app.use("/api/prestamos",prestamos)
app.use("/api/viajes",viajes)
app.use("/api/combustible",combustible)
app.use("/api/gastos",gastos)
app.use("/api/health", health)

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`Servidor escuchando en el puerto ${PORT}`);
    dbConexion();
});

export default app;