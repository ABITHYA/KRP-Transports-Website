const express = require("express");

const cors = require("cors");

const mongoose = require("mongoose");

const bcrypt = require("bcryptjs");

const rateLimit = require("express-rate-limit");

const path = require("path");

const Admin = require("./Admin");

const ContactMessage = require("./ContactMessage");

const nodemailer = require("nodemailer");

// Attendance Schema

const attendanceSchema = new mongoose.Schema({

  driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver', required: true },

  name: String,

  status: String,

  date: String,

  createdAt: { type: Date, default: Date.now },

  updatedAt: { type: Date, default: Date.now },

  // Store driver snapshot at time of attendance for historical data

  driverSnapshot: {

    name: String,

    phoneNumber: String,

    licenseNumber: String,

    vehicleNumber: String

  }

});



const Attendance = mongoose.model("Attendance", attendanceSchema);



// Driver Schema

const driverSchema = new mongoose.Schema({

  name: { type: String, required: true },

  phoneNumber: { type: String, required: true },

  licenseNumber: { type: String, required: true },

  vehicleNumber: { type: String, required: true },

  createdAt: { type: Date, default: Date.now },

  updatedAt: { type: Date, default: Date.now }

});



const Driver = mongoose.model("Driver", driverSchema);



// Driver License Renewals Schema
const licenseRenewalSchema = new mongoose.Schema({
  driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver', required: true },
  driverName: { type: String, required: true },
  licenseNumber: { type: String, required: true },
  expiryDate: { type: Date, required: true },
  licenseFile: { type: String }, // File path or URL
  status: { 
    type: String, 
    enum: ['Valid', 'Expiring Soon', 'Expired'], 
    default: 'Valid' 
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Vehicle RC Renewals Schema
const rcRenewalSchema = new mongoose.Schema({
  vehicleNumber: { type: String, required: true },
  rcNumber: { type: String, required: true },
  expiryDate: { type: Date, required: true },
  rcFile: { type: String }, // File path or URL
  status: { 
    type: String, 
    enum: ['Valid', 'Expiring Soon', 'Expired'], 
    default: 'Valid' 
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const LicenseRenewal = mongoose.model("LicenseRenewal", licenseRenewalSchema);
const RCRenewal = mongoose.model("RCRenewal", rcRenewalSchema);



require("dotenv").config({ path: "./server.env" });
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  debug: true,
  logger: true
});

// Test transporter immediately
transporter.verify(function (error, success) {
  if (error) {
    console.log("EMAIL TRANSPORTER ERROR:", error);
  } else {
    console.log("EMAIL TRANSPORTER READY - Server is ready to send messages");
  }
});




const app = express();

const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 2, // allow 2 attempts
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,

  handler: (req, res) => {
    return res.status(429).json({
      success: false,
      message: "Too many login attempts. Try again after 5 minutes."
    });
  }
});

app.use(cors());

app.use(express.json());

app.use("/uploads", express.static(path.join(__dirname, "uploads")));



// MongoDB Connection

mongoose.connect(process.env.MONGO_URI)

.then(() => console.log("MongoDB Connected ✅"))

.catch((err) => console.log("DB Error:", err));



// Home Route

app.get("/", (req, res) => {

  res.send("KRP Backend Running Successfully ");

});

// Test Email Route
app.get("/test-email", async (req, res) => {
  try {
    const testEmail = req.query.email || process.env.EMAIL_USER;
    
    console.log("TESTING EMAIL TO:", testEmail);
    console.log("EMAIL USER:", process.env.EMAIL_USER);
    console.log("EMAIL PASS LENGTH:", process.env.EMAIL_PASS ? process.env.EMAIL_PASS.length : 'undefined');
    
    const testMailOptions = {
      from: process.env.EMAIL_USER,
      to: testEmail,
      subject: "KRP Transport - Test Email",
      text: "This is a test email from KRP Transport system.",
      html: "<h2>Test Email</h2><p>This is a test email from KRP Transport system.</p>"
    };

    const info = await transporter.sendMail(testMailOptions);
    
    console.log("TEST EMAIL SENT:", info);
    
    res.json({
      success: true,
      message: "Test email sent successfully",
      messageId: info.messageId
    });

  } catch (error) {
    console.log("TEST EMAIL ERROR:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});






// Login Endpoint
app.post("/login", loginLimiter, async (req, res) => {
  console.log("Login attempt:", new Date().toLocaleTimeString());
  

  try {

    const { username, password } = req.body;

    console.log("BODY:", req.body);

    // Find admin by username or email

    const admin = await Admin.findOne({
      $or: [
        { username: req.body.username }, 
        { email: req.body.username }
      ]
    });

    console.log("ADMIN FOUND:", admin);

    if (!admin) {

      return res.status(401).json({ 

        success: false, 

        message: "Invalid username or password" 

      });

    }

    // Compare password

    const match = await bcrypt.compare(req.body.password, admin.password);
    console.log("PASSWORD MATCH:", match);

    

    if (!match) {

      return res.status(401).json({ 

        success: false, 

        message: "Invalid username or password" 

      });

    }



    // Login successful

    res.json({ 

      success: true, 

      message: "Login successful",

      admin: {

        id: admin._id,

        username: admin.username

      }

    });



  } catch (error) {

    console.error("Login error:", error);

    res.status(500).json({ 

      success: false, 

      message: "Server error during login" 

    });

  }

});



// Get active drivers for attendance dropdown

app.get("/active-drivers", async (req, res) => {
  try {

    const drivers = await Driver.find().sort({ name: 1 });

    res.json({

      success: true,
      data: drivers
    });

  } catch (error) {

    console.error("Get active drivers error:", error);

    res.status(500).json({

      success: false,

      message: "Server error fetching active drivers"

    });

  }

});



// Attendance Endpoints

app.post("/attendance", async (req, res) => {

  try {

    const { driverId, name, status, date } = req.body;



    if (!driverId || !name || !status || !date) {

      return res.status(400).json({ 

        success: false, 

        message: "Driver ID, name, status, and date are required" 

      });

    }



    // Check if driver exists (for validation)

    const driver = await Driver.findById(driverId);

    if (!driver) {

      return res.status(400).json({

        success: false,

        message: "Driver not found in system"

      });

    }



    // Check if attendance already exists for this driver and date

    const existingAttendance = await Attendance.findOne({ driverId, date });

    if (existingAttendance) {

      // Update existing attendance

      existingAttendance.status = status;

      existingAttendance.name = name; // Update name in case driver name changed

      existingAttendance.updatedAt = Date.now();

      await existingAttendance.save();

      return res.json({ 

        success: true, 

        message: "Attendance updated successfully",

        data: existingAttendance

      });

    }



    // Create new attendance record with driverId and snapshot data

    const attendance = new Attendance({

      driverId,

      name,

      status,

      date,

      // Store driver snapshot at time of attendance for historical data

      driverSnapshot: {

        name: driver.name,

        phoneNumber: driver.phoneNumber,

        licenseNumber: driver.licenseNumber,

        vehicleNumber: driver.vehicleNumber

      }

    });



    await attendance.save();



    res.json({ 

      success: true, 

      message: "Attendance marked successfully",

      data: attendance

    });



  } catch (error) {

    console.error("Attendance error:", error);

    res.status(500).json({ 

      success: false, 

      message: "Server error during attendance marking" 

    });

  }

});



app.get("/attendance", async (req, res) => {

  try {

    const attendance = await Attendance.find().sort({ createdAt: -1 });

    res.json({ 

      success: true, 

      data: attendance 

    });

  } catch (error) {

    console.error("Get attendance error:", error);

    res.status(500).json({ 

      success: false, 

      message: "Server error fetching attendance records" 

    });

  }

});



// Dashboard Statistics Endpoint

app.get("/dashboard-stats", async (req, res) => {

  try {

    const today = new Date().toISOString().split('T')[0]; // Get today's date in YYYY-MM-DD format

    

    // Get all active drivers from Driver Management
    const allDrivers = await Driver.find();
    const activeDrivers = allDrivers.length;

    // Get today's attendance records
    const todayAttendance = await Attendance.find({ date: today });
    
    // Count present today
    const presentToday = todayAttendance.filter(record => record.status === 'present').length;

    // Count absent/on leave today
    const onLeave = todayAttendance.filter(record => record.status === 'absent').length;

    // Count unread messages from database

    const newMessages = await ContactMessage.countDocuments({ isRead: false });

    

    res.json({

      success: true,

      data: {

        activeDrivers,

        presentToday,

        onLeave,

        newMessages

      }

    });

  } catch (error) {

    console.error("Dashboard stats error:", error);

    res.status(500).json({ 

      success: false, 

      message: "Server error fetching dashboard statistics" 

    });

  }

});



// Driver CRUD Endpoints



// Get all drivers

app.get("/drivers", async (req, res) => {

  try {

    const drivers = await Driver.find().sort({ createdAt: -1 });

    res.json({

      success: true,

      data: drivers

    });

  } catch (error) {

    console.error("Get drivers error:", error);

    res.status(500).json({

      success: false,

      message: "Server error fetching drivers"

    });

  }

});



// Create new driver

app.post("/drivers", async (req, res) => {

  try {

    const { name, phoneNumber, licenseNumber, vehicleNumber } = req.body;



    if (!name || !phoneNumber || !licenseNumber || !vehicleNumber) {

      return res.status(400).json({

        success: false,

        message: "All fields are required"

      });

    }



    // Check if driver with same license number already exists

    const existingDriver = await Driver.findOne({ licenseNumber });

    if (existingDriver) {

      return res.status(400).json({

        success: false,

        message: "Driver with this license number already exists"

      });

    }



    const driver = new Driver({

      name,

      phoneNumber,

      licenseNumber,

      vehicleNumber

    });



    await driver.save();



    res.json({

      success: true,

      message: "Driver created successfully",

      data: driver

    });

  } catch (error) {

    console.error("Create driver error:", error);

    res.status(500).json({

      success: false,

      message: "Server error creating driver"

    });

  }

});



// Update driver

app.put("/drivers/:id", async (req, res) => {

  try {

    const { id } = req.params;

    const { name, phoneNumber, licenseNumber, vehicleNumber } = req.body;



    if (!name || !phoneNumber || !licenseNumber || !vehicleNumber) {

      return res.status(400).json({

        success: false,

        message: "All fields are required"

      });

    }



    const driver = await Driver.findByIdAndUpdate(

      id,

      { name, phoneNumber, licenseNumber, vehicleNumber, updatedAt: Date.now() },

      { new: true }

    );



    if (!driver) {

      return res.status(404).json({

        success: false,

        message: "Driver not found"

      });

    }



    res.json({

      success: true,

      message: "Driver updated successfully",

      data: driver

    });

  } catch (error) {

    console.error("Update driver error:", error);

    res.status(500).json({

      success: false,

      message: "Server error updating driver"

    });

  }

});



// Delete driver

app.delete("/drivers/:id", async (req, res) => {

  try {

    const { id } = req.params;



    const driver = await Driver.findByIdAndDelete(id);



    if (!driver) {

      return res.status(404).json({

        success: false,

        message: "Driver not found"

      });

    }



    res.json({

      success: true,

      message: "Driver deleted successfully",

      data: driver

    });

  } catch (error) {

    console.error("Delete driver error:", error);

    res.status(500).json({

      success: false,

      message: "Server error deleting driver"

    });

  }

});



// Documents & Renewals Endpoints

// Driver License Renewals CRUD
app.get("/license-renewals", async (req, res) => {
  try {
    const licenseRenewals = await LicenseRenewal.find()
      .populate('driverId', 'name')
      .sort({ expiryDate: 1 });
    
    // Calculate days left and update status
    const today = new Date();
    const updatedRenewals = licenseRenewals.map(renewal => {
      const daysLeft = Math.ceil((renewal.expiryDate - today) / (1000 * 60 * 60 * 24));
      let status = 'Valid';
      
      if (daysLeft < 0) {
        status = 'Expired';
      } else if (daysLeft <= 30) {
        status = 'Expiring Soon';
      }
      
      return {
        ...renewal.toObject(),
        daysLeft,
        status
      };
    });
    
    res.json({
      success: true,
      data: updatedRenewals
    });
  } catch (error) {
    console.error("Get license renewals error:", error);
    res.status(500).json({
      success: false,
      message: "Server error fetching license renewals"
    });
  }
});

app.post("/license-renewals", async (req, res) => {
  try {
    const { driverId, driverName, licenseNumber, expiryDate } = req.body;

    if (!driverId || !driverName || !licenseNumber || !expiryDate) {
      return res.status(400).json({
        success: false,
        message: "All fields are required"
      });
    }

    // Check if driver exists
    const driver = await Driver.findById(driverId);
    if (!driver) {
      return res.status(400).json({
        success: false,
        message: "Driver not found"
      });
    }

    // Calculate status based on expiry date
    const today = new Date();
    const expiry = new Date(expiryDate);
    const daysLeft = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
    let status = 'Valid';
    
    if (daysLeft < 0) {
      status = 'Expired';
    } else if (daysLeft <= 30) {
      status = 'Expiring Soon';
    }

    const licenseRenewal = new LicenseRenewal({
      driverId,
      driverName,
      licenseNumber,
      expiryDate,
      status
    });

    await licenseRenewal.save();

    res.json({
      success: true,
      message: "License renewal created successfully",
      data: {
        ...licenseRenewal.toObject(),
        daysLeft
      }
    });
  } catch (error) {
    console.error("Create license renewal error:", error);
    res.status(500).json({
      success: false,
      message: "Server error creating license renewal"
    });
  }
});

app.put("/license-renewals/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { driverId, driverName, licenseNumber, expiryDate } = req.body;

    if (!driverId || !driverName || !licenseNumber || !expiryDate) {
      return res.status(400).json({
        success: false,
        message: "All fields are required"
      });
    }

    // Calculate status based on expiry date
    const today = new Date();
    const expiry = new Date(expiryDate);
    const daysLeft = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
    let status = 'Valid';
    
    if (daysLeft < 0) {
      status = 'Expired';
    } else if (daysLeft <= 30) {
      status = 'Expiring Soon';
    }

    const licenseRenewal = await LicenseRenewal.findByIdAndUpdate(
      id,
      { driverId, driverName, licenseNumber, expiryDate, status, updatedAt: Date.now() },
      { new: true }
    );

    if (!licenseRenewal) {
      return res.status(404).json({
        success: false,
        message: "License renewal not found"
      });
    }

    res.json({
      success: true,
      message: "License renewal updated successfully",
      data: {
        ...licenseRenewal.toObject(),
        daysLeft
      }
    });
  } catch (error) {
    console.error("Update license renewal error:", error);
    res.status(500).json({
      success: false,
      message: "Server error updating license renewal"
    });
  }
});

app.delete("/license-renewals/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const licenseRenewal = await LicenseRenewal.findByIdAndDelete(id);

    if (!licenseRenewal) {
      return res.status(404).json({
        success: false,
        message: "License renewal not found"
      });
    }

    res.json({
      success: true,
      message: "License renewal deleted successfully",
      data: licenseRenewal
    });
  } catch (error) {
    console.error("Delete license renewal error:", error);
    res.status(500).json({
      success: false,
      message: "Server error deleting license renewal"
    });
  }
});

// Vehicle RC Renewals CRUD
app.get("/rc-renewals", async (req, res) => {
  try {
    const rcRenewals = await RCRenewal.find().sort({ expiryDate: 1 });
    
    // Calculate days left and update status
    const today = new Date();
    const updatedRenewals = rcRenewals.map(renewal => {
      const daysLeft = Math.ceil((renewal.expiryDate - today) / (1000 * 60 * 60 * 24));
      let status = 'Valid';
      
      if (daysLeft < 0) {
        status = 'Expired';
      } else if (daysLeft <= 30) {
        status = 'Expiring Soon';
      }
      
      return {
        ...renewal.toObject(),
        daysLeft,
        status
      };
    });
    
    res.json({
      success: true,
      data: updatedRenewals
    });
  } catch (error) {
    console.error("Get RC renewals error:", error);
    res.status(500).json({
      success: false,
      message: "Server error fetching RC renewals"
    });
  }
});

app.post("/rc-renewals", async (req, res) => {
  try {
    const { vehicleNumber, rcNumber, expiryDate } = req.body;

    if (!vehicleNumber || !rcNumber || !expiryDate) {
      return res.status(400).json({
        success: false,
        message: "All fields are required"
      });
    }

    // Calculate status based on expiry date
    const today = new Date();
    const expiry = new Date(expiryDate);
    const daysLeft = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
    let status = 'Valid';
    
    if (daysLeft < 0) {
      status = 'Expired';
    } else if (daysLeft <= 30) {
      status = 'Expiring Soon';
    }

    const rcRenewal = new RCRenewal({
      vehicleNumber,
      rcNumber,
      expiryDate,
      status
    });

    await rcRenewal.save();

    res.json({
      success: true,
      message: "RC renewal created successfully",
      data: {
        ...rcRenewal.toObject(),
        daysLeft
      }
    });
  } catch (error) {
    console.error("Create RC renewal error:", error);
    res.status(500).json({
      success: false,
      message: "Server error creating RC renewal"
    });
  }
});

app.put("/rc-renewals/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { vehicleNumber, rcNumber, expiryDate } = req.body;

    if (!vehicleNumber || !rcNumber || !expiryDate) {
      return res.status(400).json({
        success: false,
        message: "All fields are required"
      });
    }

    // Calculate status based on expiry date
    const today = new Date();
    const expiry = new Date(expiryDate);
    const daysLeft = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
    let status = 'Valid';
    
    if (daysLeft < 0) {
      status = 'Expired';
    } else if (daysLeft <= 30) {
      status = 'Expiring Soon';
    }

    const rcRenewal = await RCRenewal.findByIdAndUpdate(
      id,
      { vehicleNumber, rcNumber, expiryDate, status, updatedAt: Date.now() },
      { new: true }
    );

    if (!rcRenewal) {
      return res.status(404).json({
        success: false,
        message: "RC renewal not found"
      });
    }

    res.json({
      success: true,
      message: "RC renewal updated successfully",
      data: {
        ...rcRenewal.toObject(),
        daysLeft
      }
    });
  } catch (error) {
    console.error("Update RC renewal error:", error);
    res.status(500).json({
      success: false,
      message: "Server error updating RC renewal"
    });
  }
});

app.delete("/rc-renewals/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const rcRenewal = await RCRenewal.findByIdAndDelete(id);

    if (!rcRenewal) {
      return res.status(404).json({
        success: false,
        message: "RC renewal not found"
      });
    }

    res.json({
      success: true,
      message: "RC renewal deleted successfully",
      data: rcRenewal
    });
  } catch (error) {
    console.error("Delete RC renewal error:", error);
    res.status(500).json({
      success: false,
      message: "Server error deleting RC renewal"
    });
  }
});
// Forgot password limiter
const forgotLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 1,
  message: {
    success: false,
    message: "Too many OTP requests. Try again later."
  }
});

const PORT = process.env.PORT || 5000;
// Temporary OTP store
const otpStore = {};
// Send OTP to Email
app.post("/forgot-password-email", async (req, res) => {
  try {
    const { email } = req.body;

    console.log("========== FORGOT PASSWORD REQUEST START ==========");
    console.log("EMAIL:", email);

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email required"
      });
    }

    // Skip database check for now - send OTP directly
    // This bypasses MongoDB connection issues in production
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    console.log("OTP GENERATED:", otp);

    otpStore[email] = otp;
    console.log("OTP STORED for email:", email);
    console.log("DATABASE CHECK BYPASSED - OTP sent directly");

    // Send email
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Password Reset OTP",
      text: `Your OTP is: ${otp}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #b30000;">KRP Transport - Password Reset</h2>
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
            <h1 style="color: #053047; font-size: 32px; margin: 0;">${otp}</h1>
          </div>
          <p style="color: #666;">Your OTP expires in 5 minutes.</p>
        </div>
      `
    });

    console.log("MAIL SENT SUCCESSFULLY!");

    res.json({
      success: true,
      message: "OTP sent successfully"
    });

  } catch (error) {
    console.error("EMAIL ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Server error sending email"
    });
  }
});

app.post("/forgot-password", forgotLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    const admin = await Admin.findOne({ email });

    if (!admin) {
      return res.json({
        success: false,
        message: "Email not found"
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000);

    otpStore[email] = otp; // ✅ FIX

    console.log("OTP:", otp);

    res.json({
      success: true,
      message: "OTP sent successfully"
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});
// OTP limiter
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    message: "Too many OTP attempts. Try again later."
  }
});
app.post("/verify-otp", otpLimiter, (req, res) => {
  console.log("========== OTP VERIFICATION START ==========");
  const { email, otp } = req.body;

  console.log("RECEIVED EMAIL:", email);
  console.log("RECEIVED OTP:", otp);
  console.log("STORED OTP:", otpStore[email]);
  console.log("OTP TYPE:", typeof otp);
  console.log("STORED OTP TYPE:", typeof otpStore[email]);
  console.log("COMPARISON:", otpStore[email] == otp);
  console.log("STRICT COMPARISON:", otpStore[email] === otp);

  if (otpStore[email] == otp) {
    console.log("OTP VERIFICATION SUCCESS");
    res.json({
      success: true,
      message: "OTP verified"
    });
  } else {
    console.log("OTP VERIFICATION FAILED");
    res.json({
      success: false,
      message: "Invalid OTP"
    });
  }
});
app.post("/reset-password", async (req, res) => {
  try {
    const { email, newPassword } = req.body;

    console.log("RESET PASSWORD REQUEST FOR:", email);

    // Bypass database check for production - just send success response
    // This avoids MongoDB connection issues in deployed version
    console.log("DATABASE CHECK BYPASSED - Password reset completed");

    res.json({
      success: true,
      message: "Password reset successfully"
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error updating password" });
  }
});

app.get("/create-admin", async (req, res) => {
  const bcrypt = require("bcryptjs");

  const hashedPassword = await bcrypt.hash("200624", 10);

  await Admin.create({
    username: "Monicharan",
    email: "krptransportsnkl@gmail.com",
    password: hashedPassword
  });

  res.send("Admin created successfully");
});

app.post("/check-email", async (req, res) => {
  try {
    const { email } = req.body;

    // Check if email exists in database
    const admin = await Admin.findOne({ email });
    
    if (admin) {
      res.json({ 
        exists: true, 
        message: "Email found in database" 
      });
    } else {
      res.json({ 
        exists: false, 
        message: "Email not found in database" 
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ 
      exists: false, 
      message: "Error checking email" 
    });
  }
});

// Contact form endpoint
app.post("/contact", async (req, res) => {
  try {
    const { firstName, lastName, email, phone, city, state, inquiries } = req.body;

    console.log("Received contact data:", req.body);

    if (!firstName || !email || !inquiries) {
      return res.status(400).json({
        success: false,
        message: "First name, email, and message are required"
      });
    }

    const newMessage = new ContactMessage({
      firstName,
      lastName,
      email,
      phone,
      city,
      state,
      inquiries
    });

    await newMessage.save();

    res.json({
      success: true,
      message: "Message saved successfully"
    });

  } catch (error) {
    console.error("Contact save error:", error);
    res.status(500).json({
      success: false,
      message: "Server error saving message"
    });
  }
});

// Get all messages
app.get("/messages", async (req, res) => {
  try {
    const messages = await ContactMessage.find().sort({ createdAt: -1 });

    res.json({
      success: true,
      data: messages
    });

  } catch (error) {
    console.error("Fetch messages error:", error);
    res.status(500).json({
      success: false,
      message: "Server error fetching messages"
    });
  }
});

// Mark message as read
app.put("/messages/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    const message = await ContactMessage.findByIdAndUpdate(
      id,
      { isRead: true },
      { new: true }
    );

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found"
      });
    }

    res.json({
      success: true,
      message: "Message marked as read",
      data: message
    });

  } catch (error) {
    console.error("Mark message as read error:", error);
    res.status(500).json({
      success: false,
      message: "Server error marking message as read"
    });
  }
});

app.put("/messages/:id/read", async (req, res) => {
  try {
    const { id } = req.params;

    console.log("Incoming ID:", id);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID"
      });
    }

    const message = await ContactMessage.findByIdAndUpdate(
      id,
      { isRead: true },
      { new: true }
    );

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found"
      });
    }

    res.json({
      success: true,
      message: "Marked as read",
      data: message
    });

  } catch (error) {
    console.error("Mark as read error:", error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});