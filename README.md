# Endless Runner Game

A thrilling 2D endless runner game built with Node.js, Express, and HTML5 Canvas. Navigate through obstacles, collect coins, use power-ups, and survive as long as possible while being chased by a relentless monster.

## 🎮 Game Features

### Core Gameplay
- **Endless Running**: Infinite side-scrolling gameplay with increasing difficulty
- **Multiple Obstacles**: Rocks, birds, gaps, fire traps, pendulums, and rope crossings
- **Power-up System**: Shield, magnet, speed boost, and score multipliers
- **Monster Chase**: A pursuing enemy that gets closer with each obstacle hit
- **Guest Mode**: Play without registration for quick sessions

### User System
- **User Registration/Login**: Secure JWT-based authentication
- **Personal Leaderboards**: Track your best scores and progress
- **Session Tracking**: Detailed statistics for each game session
- **Global Leaderboard**: Compete with other players

### Audio & Visual
- **Background Music**: Immersive soundtrack with toggle controls
- **Sound Effects**: Audio feedback for jumps, coin collection, and hits
- **Particle Effects**: Visual feedback for coin collection and power-ups
- **Responsive Design**: Works on desktop and mobile devices

## 🚀 Quick Start

### Prerequisites
- Node.js (v16 or higher)
- MySQL (v8.0 or higher)
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd 2dGame-Ejs
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**

   Create a `.env` file in the root directory:
   ```env
   DB_HOST=localhost
   DB_USER=your_mysql_username
   DB_PASSWORD=your_mysql_password
   DB_NAME=endless_runner
   JWT_SECRET=your_jwt_secret_key_here
   NODE_ENV=development
   PORT=5000
   ```

4. **Set up the database**

   - Create a MySQL database named `endless_runner`
   - Run the database initialization script:
     ```bash
     node init-db.js
     ```

5. **Start the server**
   ```bash
   npm start
   ```

6. **Open your browser**

   Navigate to `http://localhost:5000`

## 🎯 How to Play

### Controls
- **SPACEBAR**: Jump (double jump available)
- **S or ↓**: Slide/Crouch under obstacles
- **Click/Tap**: Jump on mobile devices

### Objectives
- **Survive**: Avoid obstacles and gaps
- **Collect Coins**: Increase your score
- **Use Power-ups**: Gain temporary advantages
- **Set Records**: Climb the leaderboard

### Obstacles
- **Rocks**: Ground obstacles that must be jumped over
- **Birds**: Flying enemies requiring sliding or jumping
- **Gaps**: Deadly pits that must be jumped across
- **Fire Traps**: Flaming obstacles that activate periodically
- **Pendulums**: Swinging axe traps
- **Ropes**: Wide gaps with ropes for crossing

### Power-ups
- **🛡️ Shield**: Temporary invulnerability (7 seconds)
- **🧲 Magnet**: Attracts nearby coins (7 seconds)
- **🚀 Speed Boost**: Increased speed with auto-dodge (7 seconds)
- **💰 Double Coins**: Score multiplier (7 seconds)

### The Monster
A relentless pursuer that gets closer after each obstacle hit. After 3 hits within 10 seconds, the monster becomes deadly and can catch you.

## 🏗️ Project Structure

```
2dGame-Ejs/
├── server.js              # Main Express server
├── game.js                # Client-side game logic
├── auth.js                # Authentication routes
├── db.js                  # Database connection
├── init-db.js            # Database initialization
├── database_schema.sql   # Database schema
├── package.json          # Dependencies and scripts
├── views/                # EJS templates
│   ├── menu.ejs         # Main menu
│   ├── game.ejs         # Game interface
│   ├── login.ejs        # Login page
│   ├── register.ejs     # Registration page
│   ├── leaderboard.ejs  # Leaderboard page
│   └── wiki.ejs         # Game information
├── public/              # Static assets
├── song/               # Audio files
└── .env                # Environment variables
```

## 🛠️ Technology Stack

### Backend
- **Node.js**: Runtime environment
- **Express.js**: Web framework
- **MySQL2**: Database driver
- **JWT**: Authentication tokens
- **bcryptjs**: Password hashing
- **EJS**: Templating engine

### Frontend
- **HTML5 Canvas**: Game rendering
- **Tailwind CSS**: UI styling
- **Vanilla JavaScript**: Game logic and interactions

### Database
- **MySQL**: Relational database
- **Tables**:
  - `users`: User accounts
  - `scores`: Game scores
  - `game_sessions`: Detailed session statistics

## 📊 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/profile` - Get user profile
- `POST /api/auth/logout` - User logout

### Game Data
- `GET /api/scores` - Get global leaderboard
- `GET /api/scores/my` - Get user's scores (authenticated)
- `POST /api/scores` - Save score (authenticated)
- `POST /api/sessions` - Save game session

### Pages
- `GET /` - Main menu
- `GET /login` - Login page
- `GET /register` - Registration page
- `GET /game` - Game page (supports guest mode)
- `GET /leaderboard` - Leaderboard page
- `GET /wiki` - Game information

## 🎵 Audio Assets

- `song/song.mp3` - Background music
- Web Audio API for sound effects

## 🔧 Development

### Available Scripts
```bash
npm start      # Start production server
npm run dev    # Start development server (same as start)
npm test       # Run tests (placeholder)
```

### Database Schema Updates
To update the database schema:
1. Modify `database_schema.sql`
2. Run `node init-db.js` to recreate tables

### Adding New Features
1. **Game Mechanics**: Modify `game.js`
2. **UI Changes**: Update EJS templates in `views/`
3. **Backend Logic**: Update `server.js` or create new routes
4. **Database Changes**: Update schema and initialization scripts

## 🎮 Game Mechanics Details

### Scoring System
- **Coins**: 1 point each
- **Distance**: Tracked in meters
- **Level**: Increases every 75 points
- **Difficulty**: Scales with score

### Difficulty Progression
- **Early Game (0-50)**: Basic obstacles, more coins
- **Mid Game (50+)**: Mixed obstacles, strategic platforms
- **Late Game**: Complex obstacle combinations, aggressive monster

### Session Tracking
Each game session records:
- Duration
- Final score
- Coins collected
- Obstacles hit
- Power-ups collected
- Distance traveled
- Game result

## 🔒 Security Features

- **JWT Authentication**: Secure token-based auth
- **Password Hashing**: bcrypt with salt rounds
- **Input Validation**: Server-side validation
- **SQL Injection Protection**: Parameterized queries
- **CORS Support**: Cross-origin resource sharing
- **Cookie Security**: HttpOnly tokens

## 📱 Responsive Design

The game adapts to different screen sizes:
- **Desktop**: Full keyboard controls
- **Mobile**: Touch controls and responsive UI
- **Canvas Scaling**: Automatic adjustment to viewport

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

### Code Style
- Use ES6+ features
- Follow consistent naming conventions
- Add comments for complex logic
- Test new features before submitting

## 📄 License

This project is licensed under the ISC License.

## 📞 Support

For questions or issues:
- Check the in-game wiki (`/wiki`)
- Review this documentation
- Create an issue in the repository

## 🎯 Future Enhancements

- [ ] Achievement system
- [ ] Multiple character skins
- [ ] Daily challenges
- [ ] Multiplayer leaderboards
- [ ] Mobile app version
- [ ] Tournament system
- [ ] Customizable controls
- [ ] Soundtrack expansion

---

**Enjoy the game and happy running!** 🏃‍♂️💨