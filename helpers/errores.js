// Error con código HTTP y mensaje pensado para mostrarse al usuario.
// Todo lo que no sea ErrorApp se responde como 500 con un mensaje genérico
// (el detalle técnico queda solo en el log del servidor).

export class ErrorApp extends Error {
  constructor(estado, mensaje, codigo = undefined) {
    super(mensaje);
    this.estado = estado;
    this.codigo = codigo;
  }
}

export const responderError = (res, error, contexto = 'Error') => {
  if (error instanceof ErrorApp) {
    const cuerpo = { mensaje: error.message };
    if (error.codigo) cuerpo.codigo = error.codigo;
    return res.status(error.estado).json(cuerpo);
  }
  console.error(`${contexto}:`, error);
  return res.status(500).json({ mensaje: 'Error interno del servidor' });
};
