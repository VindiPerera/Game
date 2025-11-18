import fetch from 'node-fetch';

async function testRegister() {
  const formData = new URLSearchParams();
  formData.append('username', 'testuser3');
  formData.append('email', 'test3@example.com');
  formData.append('password', '123456');
  formData.append('confirmPassword', '123456');

  try {
    const response = await fetch('http://localhost:5000/auth/register', {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      redirect: 'manual' // Don't follow redirects
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', response.headers.raw());
    console.log('Response body:', await response.text());
  } catch (error) {
    console.error('Error:', error);
  }
}

testRegister();