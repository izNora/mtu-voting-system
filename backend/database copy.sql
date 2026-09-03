CREATE DATABASE IF NOT EXISTS voting_system_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE voting_system_test;

CREATE TABLE majors (
    major_id INT AUTO_INCREMENT PRIMARY KEY,
    major VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE combined_festival (
    combined_id INT AUTO_INCREMENT PRIMARY KEY,
    combined_name VARCHAR(100) NOT NULL UNIQUE,
    requester_admin_id INT NOT NULL,
    started_by_admin_id INT NULL
);

CREATE TABLE combined_festival_major (
    combined_member_id INT AUTO_INCREMENT PRIMARY KEY,
    combined_id INT NOT NULL,
    major_id INT NOT NULL,
    FOREIGN KEY (combined_id)
        REFERENCES combined_festival(combined_id),
    FOREIGN KEY (major_id)
        REFERENCES majors(major_id),
    CONSTRAINT uq_combined_major
        UNIQUE (combined_id, major_id),
    INDEX idx_combined_member_major (major_id)
);

CREATE TABLE voter_info (
    voter_id INT AUTO_INCREMENT PRIMARY KEY,
    major_id INT NOT NULL,
    role VARCHAR(20) NOT NULL,
    token VARCHAR(255) NOT NULL UNIQUE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    vote_weight INT NOT NULL,
    CONSTRAINT chk_voter_vote_weight CHECK (vote_weight > 0),
    voted BOOLEAN NOT NULL DEFAULT FALSE,
    submitted BOOLEAN NOT NULL DEFAULT FALSE,
    INDEX idx_voter_major_role (major_id, role)
);

CREATE TABLE completion (
    completion_id INT AUTO_INCREMENT PRIMARY KEY,
    major_id INT NOT NULL UNIQUE,
    status INT NOT NULL DEFAULT 0,
    CONSTRAINT chk_completion_status CHECK (status IN (0, 1, 2)),
    year INT NOT NULL,
    INDEX idx_completion_year_status (year, status)
);


CREATE TABLE titles (
    title_id INT PRIMARY KEY,
    title VARCHAR(50) NOT NULL,
    major_id INT NOT NULL,
    FOREIGN KEY (major_id) REFERENCES majors(major_id),
    CONSTRAINT uq_title_major UNIQUE (major_id, title)
);

CREATE TABLE admin_table (
    admin_id INT AUTO_INCREMENT PRIMARY KEY,
    admin_name VARCHAR(255) NOT NULL,
    major_id INT NULL UNIQUE,
    admin_role VARCHAR(30) NOT NULL DEFAULT 'major_admin',
    singleton_role_key VARCHAR(30)
        GENERATED ALWAYS AS (
            CASE
                WHEN admin_role IN ('whole_admin','whole_organizer') THEN admin_role
                ELSE NULL
            END
        ) STORED UNIQUE,
    admin_gmail VARCHAR(255) NOT NULL UNIQUE,
    admin_pswd VARCHAR(255) NOT NULL,
    session_version INT NOT NULL DEFAULT 1,
    FOREIGN KEY (major_id) REFERENCES majors(major_id),
    INDEX idx_admin_role (admin_role)
);


CREATE TABLE combine_request (
    request_id INT AUTO_INCREMENT PRIMARY KEY,
    requester_admin_id INT NOT NULL,
    combined_id INT NULL,
    combined_name VARCHAR(100) NOT NULL,
    request_type ENUM('create','edit') NOT NULL DEFAULT 'create',
    status ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
    rejected_by_major_id INT NULL,
    rejection_message VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (requester_admin_id) REFERENCES admin_table(admin_id)
);

CREATE TABLE combine_request_major (
    request_member_id INT AUTO_INCREMENT PRIMARY KEY,
    request_id INT NOT NULL,
    major_id INT NOT NULL,
    response ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
    FOREIGN KEY (request_id) REFERENCES combine_request(request_id) ON DELETE CASCADE,
    FOREIGN KEY (major_id) REFERENCES majors(major_id),
    UNIQUE (request_id, major_id)
);

CREATE TABLE password_change_log (
    change_id INT AUTO_INCREMENT PRIMARY KEY,
    admin_id INT NOT NULL,
    change_date DATE NOT NULL,
    FOREIGN KEY (admin_id) REFERENCES admin_table(admin_id) ON DELETE CASCADE,
    UNIQUE (admin_id, change_date)
);

CREATE TABLE login_attempts (
    attempt_id INT AUTO_INCREMENT PRIMARY KEY,
    account_type VARCHAR(20) NOT NULL,
    identifier_type VARCHAR(10) NOT NULL,
    identifier_value VARCHAR(255) NOT NULL,
    attempt_date DATE NOT NULL,
    failed_count INT NOT NULL DEFAULT 0,
    CONSTRAINT uq_login_attempt_daily UNIQUE (
        account_type,
        identifier_type,
        identifier_value,
        attempt_date
    ),
    INDEX idx_login_attempt_date (attempt_date)
);

CREATE TABLE candidates (
    c_id INT AUTO_INCREMENT PRIMARY KEY,
    admin_id INT NOT NULL,
    c_name VARCHAR(255) NOT NULL,
    c_number INT NOT NULL,
    c_photo VARCHAR(1000),
    major_id INT NOT NULL,
    c_photo_type VARCHAR(50),
    c_gender ENUM('boy','girl') NOT NULL,
    FOREIGN KEY (admin_id) REFERENCES admin_table(admin_id),
    FOREIGN KEY (major_id) REFERENCES majors(major_id),
    CONSTRAINT uq_candidate_number_major_gender UNIQUE (major_id, c_gender, c_number),
    INDEX idx_candidate_major_gender (major_id, c_gender)
);

CREATE TABLE votes (
    vote_id INT AUTO_INCREMENT PRIMARY KEY,
    voter_id INT NOT NULL,
    c_id INT NOT NULL DEFAULT 0,
    title_id INT NOT NULL,
    CONSTRAINT uq_vote_voter_title UNIQUE (voter_id, title_id),
    FOREIGN KEY (voter_id) REFERENCES voter_info(voter_id) ON DELETE CASCADE,
    FOREIGN KEY (title_id) REFERENCES titles(title_id),
    INDEX idx_vote_candidate_title (c_id, title_id)
);

CREATE TABLE major_selection (
    m_id INT AUTO_INCREMENT PRIMARY KEY,
    c_id INT NOT NULL,
    title_id INT NOT NULL,
    target_id INT NOT NULL,
    total_vote_weight INT NOT NULL DEFAULT 0,
    year INT NOT NULL,
    FOREIGN KEY (c_id) REFERENCES candidates(c_id),
    FOREIGN KEY (title_id) REFERENCES titles(title_id),
    CONSTRAINT uq_major_award_target_year_title UNIQUE (target_id, year, title_id),
    CONSTRAINT uq_major_award_target_year_candidate UNIQUE (target_id, year, c_id),
    INDEX idx_major_selection_year (year),
    INDEX idx_major_selection_target (target_id, year)
);

CREATE TABLE whole_candidate (
    c_w_id INT AUTO_INCREMENT PRIMARY KEY,
    c_id INT NOT NULL UNIQUE,
    c_w_number INT NOT NULL UNIQUE,
    FOREIGN KEY (c_id) REFERENCES candidates(c_id)
);

CREATE TABLE the_whole_selection (
    w_id INT AUTO_INCREMENT PRIMARY KEY,
    c_id INT NOT NULL,
    title_id INT NOT NULL,
    total_vote_weight INT NOT NULL DEFAULT 0,
    year INT NOT NULL,
    FOREIGN KEY (c_id) REFERENCES candidates(c_id),
    FOREIGN KEY (title_id) REFERENCES titles(title_id),
    CONSTRAINT uq_whole_award_year_title UNIQUE (year, title_id),
    CONSTRAINT uq_whole_award_year_candidate UNIQUE (year, c_id)
);
