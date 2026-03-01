import { generarJWT } from "../helpers/generar-jwt.js";
import { usuarioHelper } from '../helpers/usuarios.js';
import { firebaseHelper } from '../helpers/firebase.js';


const FILTRO_HANDLERS = {
  perfil: usuarioHelper.getUsuarioPorPerfil,
  estado: usuarioHelper.getUsuarioPorEstado
};
const TIPOS_FILTRO = Object.keys(FILTRO_HANDLERS);

const httpUsuarios = {
  getUsuariosDesdeSheets: async (req, res) => {
    try {
      const usuarios = await usuarioHelper.getUsuarios();
      res.json({ usuarios });
    } catch (error) {
      console.error('Error leyendo hoja de usuarios', error);
      res.status(500).json({ error: 'Error al leer hoja de cálculo' });
    }
  },

login: async (req, res) => {
  const { email, password } = req.body;
  
  try {
    const { token, usuario } = await usuarioHelper.loginUsuario({ email, password });

    return res.json({
      token,
      usuario
    });

  } catch (error) {
    console.error("Error en login:", error); 
    res.status(400).json({ msg: error?.message || 'Error en el login' });
  }
},

  obtenerUsuariosActivos: async (req, res) => {
    try {
      const data = await usuarioHelper.getUsuarioByStatus('activo');
      res.json(data);
    } catch (error) {
      console.error('Error al obtener datos:', error);
      res.status(500).json({ mensaje: 'Error al obtener usuarios activos' });
    }
  },

  obtenerUsuariosInactivos: async (req, res) => {
    try {
      const data = await usuarioHelper.getUsuarioByStatus('inactivo');
      res.json(data);
    } catch (error) {
      console.error('Error al obtener datos:', error);
      res.status(500).json({ mensaje: 'Error al obtener usuarios activos' });
    }
  },

  obtenerUsuarioporEmail: async (req, res) => {
    try {
      const { email } = req.params;
      const usuario = await usuarioHelper.getUsuarioByEmail(email);
  
      if (!usuario) {
        return res.status(404).json({ mensaje: 'usuario no encontrado' });
      }
  
      res.json(usuario);
    } catch (error) {
      console.error('Error al obtener usuario:', error);
      res.status(500).json({ mensaje: 'Error al obtener usuario' });
    }
  },

  obtenerUsuariosPerfilJefe: async (req, res) => {
    try {
      const data = await usuarioHelper.getUsuarioByPerfil('jefepiloto');
      res.json(data);
    } catch (error) {
      console.error('Error al obtener datos:', error);
      res.status(500).json({ mensaje: 'Error al obtener usuarios jefe' });
    }
  },

  obtenerUsuariosPerfilCoordinador: async (req, res) => {
    try {
      const data = await usuarioHelper.getUsuarioByPerfil('coordinador');
      res.json(data);
    } catch (error) {
      console.error('Error al obtener datos:', error);
      res.status(500).json({ mensaje: 'Error al obtener coordinadores' });
    }
  },

  obtenerUsuariosPerfilPiloto: async (req, res) => {
    try {
      const data = await usuarioHelper.getUsuarioByPerfil('piloto');
      res.json(data);
    } catch (error) {
      console.error('Error al obtener datos:', error);
      res.status(500).json({ mensaje: 'Error al obtener pilotos' });
    }
  },

  obtenerUsuariosPerfilCliente: async (req, res) => {
    try {
      const data = await usuarioHelper.getUsuarioByPerfil('cliente');
      res.json(data);
    } catch (error) {
      console.error('Error al obtener datos:', error);
      res.status(500).json({ mensaje: 'Error al obtener clientes' });
    }
  },

    obtenerUsuariosFiltrados: async (req, res) => {
  try {
    const { tipo, valor } = req.query;
    
    // console.log("Parámetros recibidos:", req.query);
    // console.log(`tipo: "${tipo}", valor: "${valor}"`);
    
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
    const usuario = await handlerFn(valor);
    
    res.json(usuario);
  } catch (error) {
    console.error("Error al obtener usuario filtrados:", error);
    res.status(500).json({ mensaje: "Error al obtener usuario", error: error.message });
  }
},

crearUsuario: async (req, res) => {
  try {
    const {nombre, email, password, perfil, placa_asignada, tipo_documento, documento, ciudad_expedicion, fecha_expedicion, pais_nacimiento, ciudad_nacimiento, fecha_nacimiento, grupo_sanguineo_rh, genero, estado_civil, telefono, tipo_licencia, num_licencia, fecha_expedicion_licencia, viajes_realizados, banco, num_cuenta, salario_base, sso} = req.body;
  
      const estado = req.body.estado || "activo";
      const codigo = req.body.fechacodigo || "";
      const fechacodigo = req.body.fechacodigo || "";
  
      const fecha_vencimiento = fecha_expedicion_licencia 
      ? new Date(new Date(fecha_expedicion_licencia).setFullYear(new Date(fecha_expedicion_licencia).getFullYear() + 2)).toISOString().split('T')[0]
      : null;

      const resultado = await usuarioHelper.guardarUsuario({nombre, email, password, perfil, estado,  placa_asignada, tipo_documento, documento, ciudad_expedicion, fecha_expedicion, pais_nacimiento, ciudad_nacimiento, fecha_nacimiento, grupo_sanguineo_rh, genero, estado_civil, telefono, tipo_licencia, num_licencia, fecha_expedicion_licencia, fecha_vencimiento, viajes_realizados, banco, num_cuenta, salario_base, sso, codigo, codigo, fechacodigo });
    
        res.status(200).json({
          mensaje: 'Usuario guardado correctamente',
          nombre: resultado.nombre,
         
        });
  } catch (error) { 
        console.error('Error al guardar usuario:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor' });
      }
},
    
      editarUsuario: async (req, res) => {
        try {
          const { email } = req.params;
          const nuevosDatos = req.body;
    
        const resultado = await usuarioHelper.editarUsuario(email, nuevosDatos);
    
          if (!resultado) {
            return res.status(404).json({ mensaje: 'Usuario no encontrado' });
          }
      
          res.status(200).json({ mensaje: 'Usuario actualizado correctamente' });
        } catch (error) {
          console.error('Error al editar Usuario:', error);
          res.status(500).json({ mensaje: 'Error interno del servidor' });
        }
      },

      editarPasswordUsuario: async (req, res) => {
        try {
          const { email } = req.params;
          const password = req.body;
    
        const resultado = await usuarioHelper.editarPasswordUsuario(email, password);
    
          if (!resultado) {
            return res.status(404).json({ mensaje: 'Usuario no encontrado' });
          }
      
          res.status(200).json({ mensaje: 'Contraseña actualizada correctamente' });
        } catch (error) {
          console.error('Error al editar Usuario:', error);
          res.status(500).json({ mensaje: 'Error interno del servidor' });
        }
      },
      
    activarUsuario: async (req, res) => {
      try {
        const { email } = req.params;
        const { estado } = req.body; 
        
        const resultado = await usuarioHelper.actualizarEstadoEnSheets(email, estado || "activo");

    if (!resultado) {
            return res.status(404).json({ mensaje: 'Usuario no encontrado' });
    }
    
        res.status(200).json({ mensaje: 'Estado actualizado correctamente' });
      } catch (error) {
        console.error('Error al editar estado del usuario:', error);
        res.status(500).json({ 
          mensaje: 'Error al actualizar estado', 
          error: error.message 
        });
      }
    },
    
    desactivarUsuario: async (req, res) => {
      try {
        const { email } = req.params;
        const { estado } = req.body; 
        
        const resultado = await usuarioHelper.actualizarEstadoEnSheets(email, estado || "inactivo");
    
      if (!resultado) {
            return res.status(404).json({ mensaje: 'Usuario no encontrado' });
          }

        res.status(200).json({ mensaje: 'Estado actualizado correctamente' });
      } catch (error) {
        console.error('Error al editar estado del usuario:', error);
        res.status(500).json({ 
          mensaje: 'Error al actualizar estado', 
          error: error.message 
        });
      }
    },

    registrarTokenFCM: async (req, res) => {
  try {
    const { token } = req.body;
    const email = req.usuariobdtoken.email;
    
    if (!token) {
      return res.status(400).json({ msg: "El token FCM es obligatorio" });
    }
    
    const resultado = await firebaseHelper.guardarTokenFCM(email, token);
    
    if (resultado) {
      return res.json({ 
        msg: "Token FCM registrado correctamente" 
      });
    } else {
      return res.status(500).json({ 
        msg: "Error al registrar token FCM" 
      });
    }
  } catch (error) {
    console.error("Error al registrar token FCM:", error);
    res.status(500).json({ msg: "Error interno del servidor" });
  }
}

};
export default httpUsuarios;
