CREATE TABLE roles (
  RoleID INT PRIMARY KEY AUTO_INCREMENT,
  RoleName VARCHAR(50) NOT NULL
);

INSERT INTO roles VALUES
(1, 'user'),
(2, 'admin');


CREATE TABLE users (
  EMPID INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(50) UNIQUE,
  password VARCHAR(255),
  fullname VARCHAR(100),
  email VARCHAR(100),
  RoleID INT DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (RoleID) REFERENCES roles(RoleID)
);


CREATE TABLE devices (
  DVID INT PRIMARY KEY AUTO_INCREMENT,
  devicename VARCHAR(255),
  serialnumber VARCHAR(100),
  status ENUM('available','borrowed','repair') DEFAULT 'available',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE borrow_trans (
  BorrowID INT PRIMARY KEY AUTO_INCREMENT,
  EMPID INT,
  DVID INT,
  borrow_date DATETIME,
  due_date DATETIME,
  return_date DATETIME,
  status ENUM('pending','approved','rejected','returned') DEFAULT 'pending',
  FOREIGN KEY (EMPID) REFERENCES users(EMPID),
  FOREIGN KEY (DVID) REFERENCES devices(DVID)
);
