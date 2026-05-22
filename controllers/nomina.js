import { nominaHelper } from '../helpers/nomina.js';

const ORDENAMIENTO_HANDLERS = {
  valor: nominaHelper.getNominasOrdenadosPorValor,
  viajes: nominaHelper.getNominasOrdenadosPorViajes,
};

const FILTRO_HANDLERS = {
    tipo: nominaHelper.getNominasPorTipo,
    mes: nominaHelper.getNominaPorMes,
};

const TIPOS_ORDENAMIENTO = Object.keys(ORDENAMIENTO_HANDLERS);
const TIPOS_FILTRO = Object.keys(FILTRO_HANDLERS);

const httpNominas = {

obtenerNomina: async (req, res) => {
    try {
      const data = await nominaHelper.getNominaConductores();
      res.json(data);
    } catch (error) {
      console.error('Error al obtener datos:', error);
      res.status(500).json({ mensaje: 'Error al obtener las nóminas' });
    }
},

obtenerNominaPorConsecutivo: async (req, res) => {
  try {
    const { consecutivo } = req.params;
    const nomina = await nominaHelper.getNominaByConsecutivo(consecutivo);

    if (!nomina) {
      return res.status(404).json({ mensaje: 'nómina no encontrada' });
    }

    res.json(nomina);
  } catch (error) {
    console.error('Error al obtener nómina:', error);
    res.status(500).json({ mensaje: 'Error al obtener nómina' });
  }
},

obtenerResumenNominaSolicitante: async (req, res) => {
  try {
    // const { email } = req.params;
    const email = req.usuariobdtoken.email;
    
    if (!email) {
      return res.status(400).json({
        ok: false,
        mensaje: 'Email es requerido'
      });
    }

    const resumen = await nominaHelper.getResumenNominaPorSolicitante(email);
    
    res.json({
      ok: true,
      resumen,
      email,
      mensaje: 'Resumen obtenido exitosamente'
    });
  } catch (error) {
    console.error('Error al obtener resumen de nómina por email:', error);
    res.status(500).json({
      ok: false,
      mensaje: 'Error interno del servidor',
      error: error.message
    });
  }
},

obtenerNominaOrdenados: async (req, res) => {
  try {
    const { tipo = "tiempo", orden = "desc" } = req.query;
    
    if (orden !== "asc" && orden !== "desc") {
      return res
        .status(400)
        .json({ mensaje: 'El parámetro orden debe ser "asc" o "desc"' });
    }
    
    const tipoLower = tipo.toLowerCase();
    if (!TIPOS_ORDENAMIENTO.includes(tipoLower)) {
      return res
        .status(400)
        .json({ 
          mensaje: `El parámetro tipo debe ser uno de: ${TIPOS_ORDENAMIENTO.join(', ')}`,
          tiposPermitidos: TIPOS_ORDENAMIENTO
        });
    }
    
    const handlerFn = ORDENAMIENTO_HANDLERS[tipoLower];
    const nominas = await handlerFn(orden);
    
    res.json(nominas);
  } catch (error) {
    console.error("Error al obtener nominas ordenados:", error);
    res.status(500).json({ mensaje: "Error al obtener nominas" });
  }
},

obtenerNominaFiltrados: async (req, res) => {
  try {
    const { tipo, valor } = req.query;
    
    if (!tipo || !valor) {
      return res
        .status(400)
        .json({ mensaje: 'Se requieren los parámetros tipo y valor' });
    }
    
    const tipoLower = tipo.toLowerCase();
    if (!TIPOS_FILTRO.includes(tipoLower)) {
      return res
        .status(400)
        .json({ 
          mensaje: `El parámetro tipo debe ser uno de: ${TIPOS_FILTRO.join(', ')}`,
          tiposPermitidos: TIPOS_FILTRO
        });
    }
    
    const handlerFn = FILTRO_HANDLERS[tipoLower];
    const nominas = await handlerFn(valor);
    
    res.json(nominas);
  } catch (error) {
    console.error("Error al obtener nominas filtrados:", error);
    res.status(500).json({ mensaje: "Error al obtener nominas", error: error.message });
  }
},

calcularNomina: async (req, res) => {
  try {
    const { email } = req.params;
    const { mes } = req.query; // ?mes=2026-01
    const resultado = await nominaHelper.calcularNomina(email, mes);
    res.status(200).json({ ok: true, resultado });
  } catch (error) {
    console.error('Error al calcular nómina:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
},

aprobarNomina: async (req, res) => {
  try {
    const { email } = req.params;
    const { mes } = req.body;
    const resultado = await nominaHelper.aprobarNomina(email, mes);
    res.status(200).json({ ok: true, mensaje: 'Nómina aprobada y liquidada', resultado });
  } catch (error) {
    console.error('Error al aprobar nómina:', error);
    res.status(400).json({ 
    ok: false,
    mensaje: error.message 
  });
  }
},

pagarSalarioMensual: async (req, res) => {
  try {
    const { email } = req.params;
    const { mes } = req.body; // "2025-01"
    const resultado = await nominaHelper.pagarSalarioMensual(email, mes);
    res.status(200).json({ ok: true, mensaje: 'Salario mensual pagado', resultado });
  } catch (error) {
    console.error('Error al pagar salario:', error);
    res.status(400).json({ 
    ok: false,
    mensaje: error.message 
  });
  }
},

}

export default httpNominas;
