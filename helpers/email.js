import nodemailer from 'nodemailer'

console.log('EMAIL_USER:', process.env.EMAIL_USER)
console.log('EMAIL_PASS existe:', !!process.env.EMAIL_PASS)

const transporter = nodemailer.createTransport({

  service: 'gmail',

  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },

})

export const enviarCodigoRecuperacion = async (
  email,
  nombre,
  codigo
) => {

  await transporter.sendMail({

    from: `LJC Transporte <${process.env.EMAIL_USER}>`,

    to: email,

    subject: 'Código de recuperación de contraseña',

    html: `
      <p>Hola ${nombre},</p>

      <p>Tu código de recuperación es:</p>

      <h2 style="letter-spacing: 4px">
        ${codigo}
      </h2>

      <p>
        Este código vence en
        <strong>15 minutos</strong>.
      </p>

      <p>
        Si no solicitaste esto,
        ignora este mensaje.
      </p>
    `,
  })

}