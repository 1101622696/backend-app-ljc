import { generarJWT } from './generar-jwt.js'; 

import { google } from 'googleapis';

const spreadsheetId = '1UtSm_ZBiNWt2njncuJ5PSHreMbj3InG9gyXapqVUBEQ';

const getAuth = () => {
  if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    return new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  } else {
    return new google.auth.GoogleAuth({
      keyFile: './config/credenciales-sheets.json',
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }
};

const getSheetsClient = async () => {
  const auth = getAuth();
  return google.sheets({ version: 'v4', auth });
};

const leerUsuariosDesdeSheets = async () => {
  const sheets = await getSheetsClient();
  
  const range = 'Usuarios!A1:AB15'; 
const spreadsheetId = '1UtSm_ZBiNWt2njncuJ5PSHreMbj3InG9gyXapqVUBEQ';

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  const rows = res.data.values;
  if (rows.length === 0) {
    return [];
  }

  const headers = rows[0].map(h => h.trim().toLowerCase());
  const data = rows.slice(1).map((fila) => {
    const userData = Object.fromEntries(fila.map((valor, i) => [headers[i], valor]));
    return {
      id: userData.id || '',
      email: userData.email || '',
      nombre: userData.nombre || '',
      password: userData.password || '',
      perfil: userData.perfil || '',
      estado: userData.estado || '',
      placa_asignada: userData.placa_asignada || '',
      tipo_documento: userData.tipo_documento || '',
      documento: userData.documento || '',
      ciudad_expedicion: userData.ciudad_expedicion || '',
      fecha_expedicion: userData.fecha_expedicion || '',
      pais_nacimiento: userData.pais_nacimiento || '',
      ciudad_nacimiento: userData.ciudad_nacimiento || '',
      fecha_nacimiento: userData.fecha_nacimiento || '',
      grupo_sanguineo_rh: userData.grupo_sanguineo_rh || '',
      genero: userData.genero || '',
      estado_civil: userData.estado_civil || '',
      telefono: userData.telefono || '',
      tipo_licencia: userData.tipo_licencia || '',
      num_licencia: userData.num_licencia || '',
      fecha_expedicion_licencia: userData.fecha_expedicion_licencia || '',
      fecha_vencimiento: userData.fecha_vencimiento || '',
      viajes_realizados: userData.viajes_realizados || '',
      banco: userData.banco || '',
      num_cuenta: userData.num_cuenta || '',
      salario_base: userData.salario_base || '',
      sso: userData.sso || '',
      codigo: userData.codigo || '',
      fecha_codigo: userData.fecha_codigo || '',
    };
  });  

  return data;
};

const getUsuarios = () => leerUsuariosDesdeSheets();

const loginUsuario = async ({ email, password }) => {
    const usuarios = await leerUsuariosDesdeSheets();
    
    const usuario = usuarios.find(u => u.email === email);
    
    if (!usuario) {
      throw new Error('Usuario no encontrado');
    }
    
    if (usuario.estado === 'inactivo') {
      throw new Error('Usuario o contraseña incorrecta');
    }
    
    if (usuario.password !== password) {
      throw new Error('Usuario o contraseña incorrecta');
    }
    
    const token = await generarJWT(
      usuario.id || usuario.email, 
      usuario.perfil,
      usuario.email,
      usuario.nombre,
      usuario.placa_asignada || null 
    );
      
    return {
      token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        perfil: usuario.perfil,
        placa_asignada: usuario.placa_asignada || null
      }
    };
  };

  const getUsuarioByStatus = async (status) => {
    const usuarios = await getUsuarios();
    return usuarios.filter(usuario => 
      usuario.estado && usuario.estado.toLowerCase() === status.toLowerCase()
    );
  };

  const getUsuarioByEmail = async (email) => {
    const usuarios = await getUsuarios();
    return usuarios.find(usuario => 
      usuario.email && usuario.email.toLowerCase() === email.toLowerCase()
    );
  };
  
  const getUsuarioByPerfil = async (perfile) => {
    const usuarios = await getUsuarios();
    return usuarios.filter(usuario => 
      usuario.perfil && usuario.perfil.toLowerCase() === perfile.toLowerCase()
    );
  };

  const filtrarUsuarioPorCampoTexto = (usuarios, campo, valor) => {
  return usuarios.filter(dron => 
    dron[campo] && dron[campo].toLowerCase() === valor.toLowerCase()
  );
};

const getUsuarioPorPerfil = async (valor) => {
  const usuarios = await getUsuarios();
  return filtrarUsuarioPorCampoTexto(usuarios, "perfil", valor);
};

const getUsuarioPorEstado = async (valor) => {
  const usuarios = await getUsuarios();
  return filtrarUsuarioPorCampoTexto(usuarios, "estado", valor);
};

const guardarUsuario = async ({ nombre, email, password, perfil, estado,  placa_asignada, tipo_documento, documento, ciudad_expedicion, fecha_expedicion, pais_nacimiento, ciudad_nacimiento, fecha_nacimiento, grupo_sanguineo_rh, genero, estado_civil, telefono, tipo_licencia, num_licencia, fecha_expedicion_licencia, fecha_vencimiento, viajes_realizados, banco, num_cuenta, salario_base, sso, codigo, fechacodigo }) => {
    const sheets = await getSheetsClient();
    const nuevaFila = [nombre, email, password, perfil, estado,  placa_asignada, tipo_documento, documento, ciudad_expedicion, fecha_expedicion, pais_nacimiento, ciudad_nacimiento, fecha_nacimiento, grupo_sanguineo_rh, genero, estado_civil, telefono, tipo_licencia, num_licencia, fecha_expedicion_licencia, fecha_vencimiento, viajes_realizados, banco, num_cuenta, salario_base, sso, codigo, fechacodigo];
  
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Usuarios!A1:AB15',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [nuevaFila] },
    });
  
    return { nombre };
};

const editarUsuario= async (email, nuevosDatos) => {
    const sheets = await getSheetsClient();
  
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Usuarios!A2:AB15', 
    });
  
    const filas = response.data.values;
    const filaIndex = filas.findIndex(fila => fila[1]?.toLowerCase() === email.toLowerCase());
  
    if (filaIndex === -1) {
      return null; 
    }
  
    // teer los datos actuales
    const filaActual = filas[filaIndex];
    
    const filaEditada = [
      nuevosDatos.nombre || filaActual[0],
      nuevosDatos.email || filaActual[1],
      filaActual[2], 
      nuevosDatos.perfil || filaActual[3],
      filaActual[4], 
      nuevosDatos.placa_asignada || filaActual[5], 
      nuevosDatos.tipo_documento || filaActual[6], 
      nuevosDatos.documento || filaActual[7], 
      nuevosDatos.ciudad_expedicion || filaActual[8], 
      nuevosDatos.fecha_expedicion || filaActual[9], 
      nuevosDatos.pais_nacimiento || filaActual[10], 
      nuevosDatos.ciudad_nacimiento || filaActual[11], 
      nuevosDatos.fecha_nacimiento || filaActual[12], 
      nuevosDatos.grupo_sanguineo_rh || filaActual[13], 
      nuevosDatos.genero || filaActual[14], 
      nuevosDatos.estado_civil || filaActual[15], 
      nuevosDatos.telefono || filaActual[16], 
      nuevosDatos.tipo_licencia || filaActual[17], 
      nuevosDatos.num_licencia || filaActual[18], 
      nuevosDatos.fecha_expedicion_licencia || filaActual[19], 
      nuevosDatos.fecha_vencimiento || filaActual[20], 
      nuevosDatos.viajes_realizados || filaActual[21], 
      nuevosDatos.banco || filaActual[22], 
      nuevosDatos.num_cuenta || filaActual[23], 
      nuevosDatos.salario_base || filaActual[24], 
      nuevosDatos.sso || filaActual[25], 
      nuevosDatos.perfil || filaActual[26], 
      filaActual[27],
      filaActual[28],

    ];
  
    const filaEnHoja = filaIndex + 2; 
  
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Usuarios!A${filaEnHoja}:AB${filaEnHoja}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [filaEditada],
      },
    });
  
    return true;
};

const editarPasswordUsuario= async (email, password) => {
    const sheets = await getSheetsClient();
  
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Usuarios!A2:N', 
    });
  
    const filas = response.data.values;
    const filaIndex = filas.findIndex(fila => fila[1]?.toLowerCase() === email.toLowerCase());
  
    if (filaIndex === -1) {
      return null; 
    }
  
    // teer los datos actuales
    const filaActual = filas[filaIndex];
    
    const filaEditada = [
      filaActual[0], 
      filaActual[1], 
      password.password || filaActual[2],
      filaActual[3], 
      filaActual[4], 
      filaActual[5], 
      filaActual[6], 
      filaActual[7], 
      filaActual[8], 
      filaActual[9], 
      filaActual[10], 
      filaActual[11], 
      filaActual[12], 
      filaActual[13], 
      filaActual[14], 
      filaActual[15], 
      filaActual[16], 
      filaActual[17], 
      filaActual[18], 
      filaActual[19], 
      filaActual[20], 
      filaActual[21], 
      filaActual[22], 
      filaActual[23], 
      filaActual[24], 
      filaActual[25], 
      nuevosDatos.codigo || filaActual[26],
      nuevosDatos.fechacodigo || filaActual[27],
    ];
  
    const filaEnHoja = filaIndex + 2; 
  
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Usuarios!A${filaEnHoja}:G${filaEnHoja}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [filaEditada],
      },
    });
  
    return true;
};
  
const actualizarEstadoEnSheets = async (email, nuevoEstado = "activo") => {
    try {
      const sheets = await getSheetsClient();
      
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Usuarios',
      });
      
      const rows = response.data.values;
      if (!rows || rows.length === 0) {
        throw new Error('No se encontraron datos en la hoja');
      }
      
      // Determinar qué columna contiene el email y el estado
      const headers = rows[0];
      const emailIndex = headers.findIndex(header => 
        header.toLowerCase() === 'email');
      const estadoIndex = headers.findIndex(header => 
        header.toLowerCase() === 'estado');
      
      if (emailIndex === -1 || estadoIndex === -1) {
        throw new Error('No se encontraron las columnas necesarias');
      }
      
      // Encontrar la fila que corresponde al email
      let rowIndex = -1;
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][emailIndex] && 
            rows[i][emailIndex].toLowerCase() === email.toLowerCase()) {
          rowIndex = i;
          break;
        }
      }
      
      if (rowIndex === -1) {
        throw new Error(`No se encontró el email ${email}`);
      }
      
      // Actualizar el estado en Google Sheets
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Usuarios!${getColumnLetter(estadoIndex + 1)}${rowIndex + 1}`,
        valueInputOption: 'RAW',
        resource: {
          values: [[nuevoEstado]]
        }
      });
      
      return true;
    } catch (error) {
      console.error('Error al actualizar el estado en Google Sheets:', error);
      throw error;
    }
};
  
  // Función auxiliar para convertir número de columna a letra
function getColumnLetter(columnNumber) {
    let columnLetter = '';
    while (columnNumber > 0) {
      const remainder = (columnNumber - 1) % 26;
      columnLetter = String.fromCharCode(65 + remainder) + columnLetter;
      columnNumber = Math.floor((columnNumber - 1) / 26);
    }
    return columnLetter;
}

export const usuarioHelper = {
  getUsuarios,
  loginUsuario,
  guardarUsuario,
  editarUsuario,
  editarPasswordUsuario,
  actualizarEstadoEnSheets,
  getUsuarioByStatus,
  getUsuarioByPerfil,
  getUsuarioByEmail,
  getUsuarioPorPerfil,
  getUsuarioPorEstado,
  getAuth,
  getSheetsClient,
  leerUsuariosDesdeSheets
};
