-- create table car (
-- 	id BIGSERIAL NOT NULL PRIMARY KEY,
-- 	make VARCHAR(100) NOT NULL,
-- 	model  VARCHAR(100) NOT NULL,
-- 	price NUMERIC(19, 2) NOT NULL
-- );

create table companies (
	id VARCHAR(50) PRIMARY KEY,
	title VARCHAR(100),
	language VARCHAR(100),
	settings VARCHAR(100),
	storagePath VARCHAR(100),
	created DATE,
	updated DATE
);

create table branches (
	id VARCHAR(50) PRIMARY KEY,
	title VARCHAR(100),
	company VARCHAR(100),
	subBranches TEXT[],
	language VARCHAR(100),
	settings VARCHAR(100),
	created DATE,
	updated DATE
);

create table roles (
	id VARCHAR(50) PRIMARY KEY,
	created DATE,
	updated DATE
);

create table users (
	email VARCHAR(100) PRIMARY KEY,
	id VARCHAR(50),
	firstName VARCHAR(100),
	lastName VARCHAR(100),
	hash VARCHAR(100),
	company VARCHAR(100),
	branch VARCHAR(100),
	role VARCHAR(100),	
	settings VARCHAR(100),
	created DATE,
	updated DATE
);

create table projects (
	id VARCHAR(50) PRIMARY KEY,
	title VARCHAR(100),
	branch VARCHAR(100),
	owner VARCHAR(100),
	editors TEXT[],
	backups TEXT[],
	currentVersion VARCHAR(100),
	published BOOLEAN,
	publishedURL VARCHAR(100),
	analyticsId VARCHAR(100),	
	created DATE,
	updated DATE
);

create table projectsnapshots (
	id VARCHAR(50) PRIMARY KEY,
	filename VARCHAR(100),
	created DATE
);

create table images (
	id VARCHAR(50) PRIMARY KEY,
	filename VARCHAR(100),
	uploadedTo VARCHAR(100),
	belongsTo VARCHAR(100),
	path VARCHAR(100),
	created DATE,
	updated DATE
);









insert into car (id, make, model , price) values (1, 'Ford', 'Contour', '$100000.00');
