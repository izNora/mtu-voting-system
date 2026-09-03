from sqlalchemy import Boolean, Column, Date, DateTime, Enum, ForeignKey, Index, Integer, String, UniqueConstraint, func
from .database import Base


class CombinedFestival(Base):
    __tablename__ = "combined_festival"

    combined_id = Column(Integer, primary_key=True)
    combined_name = Column(String(100), unique=True, nullable=False)
    requester_admin_id = Column(Integer, nullable=False)
    started_by_admin_id = Column(Integer, nullable=True)


class CombinedFestivalMajor(Base):
    __tablename__ = "combined_festival_major"
    __table_args__ = (UniqueConstraint("combined_id", "major_id", name="uq_combined_major"),)

    combined_member_id = Column(Integer, primary_key=True)
    combined_id = Column(
        Integer,
        ForeignKey("combined_festival.combined_id"),
        nullable=False,
    )
    major_id = Column(
        Integer,
        ForeignKey("majors.major_id"),
        nullable=False,
    )

class Voter(Base):
    __tablename__ = 'voter_info'
    voter_id = Column(Integer, primary_key=True)
    major_id = Column(Integer, nullable=False)
    role = Column(String(20), nullable=False)
    token = Column(String(255), unique=True, nullable=False)
    active = Column(Boolean, nullable=False, default=True)
    vote_weight = Column(Integer, nullable=False)
    voted = Column(Boolean, nullable=False, default=False)
    submitted = Column(Boolean, nullable=False, default=False)

class Major(Base):
    __tablename__ = 'majors'
    major_id = Column(Integer, primary_key=True)
    major = Column(String(50), unique=True, nullable=False)

class Completion(Base):
    __tablename__ = 'completion'
    completion_id = Column(Integer, primary_key=True)
    major_id = Column(Integer, unique=True, nullable=False)
    status = Column(Integer, nullable=False, default=0)
    year = Column(Integer, nullable=False)

class Title(Base):
    __tablename__ = 'titles'
    title_id = Column(Integer, primary_key=True)
    title = Column(String(50), nullable=False)
    major_id = Column(Integer,ForeignKey('majors.major_id'),nullable=False)

    __table_args__ = (UniqueConstraint('major_id', 'title', name='uq_title_major'),)

class Admin(Base):
    __tablename__ = 'admin_table'
    admin_id = Column(Integer, primary_key=True)
    admin_name = Column(String(255), nullable=False)
    major_id = Column(Integer, ForeignKey('majors.major_id'), nullable=True, unique=True)
    admin_role = Column(String(30), nullable=False, default='major_admin')
    admin_gmail = Column(String(255), unique=True, nullable=False)
    admin_pswd = Column(String(255), nullable=False)
    session_version = Column(Integer, nullable=False, default=1)

class CombineRequest(Base):
    __tablename__ = 'combine_request'
    request_id = Column(Integer, primary_key=True)
    requester_admin_id = Column(Integer, ForeignKey('admin_table.admin_id'), nullable=False)
    combined_id = Column(Integer, nullable=True)
    combined_name = Column(String(100), nullable=False)
    request_type = Column(Enum('create', 'edit'), nullable=False, default='create')
    status = Column(Enum('pending', 'accepted', 'rejected'), nullable=False, default='pending')
    rejected_by_major_id = Column(Integer, nullable=True)
    rejection_message = Column(String(255), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())


class CombineRequestMajor(Base):
    __tablename__ = 'combine_request_major'
    __table_args__ = (UniqueConstraint('request_id', 'major_id', name='uq_combine_request_major'),)
    request_member_id = Column(Integer, primary_key=True)
    request_id = Column(Integer, ForeignKey('combine_request.request_id'), nullable=False)
    major_id = Column(Integer, ForeignKey('majors.major_id'), nullable=False)
    response = Column(Enum('pending', 'accepted', 'rejected'), nullable=False, default='pending')


class PasswordChangeLog(Base):
    __tablename__ = 'password_change_log'
    __table_args__ = (UniqueConstraint('admin_id', 'change_date', name='uq_password_change_day'),)
    change_id = Column(Integer, primary_key=True)
    admin_id = Column(Integer, ForeignKey('admin_table.admin_id'), nullable=False)
    change_date = Column(Date, nullable=False)


class LoginAttempt(Base):
    __tablename__ = 'login_attempts'
    __table_args__ = (
        UniqueConstraint(
            'account_type',
            'identifier_type',
            'identifier_value',
            'attempt_date',
            name='uq_login_attempt_daily',
        ),
        Index('idx_login_attempt_date', 'attempt_date'),
    )
    attempt_id = Column(Integer, primary_key=True)
    account_type = Column(String(20), nullable=False)
    identifier_type = Column(String(10), nullable=False)
    identifier_value = Column(String(255), nullable=False)
    attempt_date = Column(Date, nullable=False)
    failed_count = Column(Integer, nullable=False, default=0)

class Candidate(Base):
    __tablename__ = 'candidates'
    c_id = Column(Integer, primary_key=True)
    admin_id = Column(Integer, ForeignKey('admin_table.admin_id'), nullable=False)
    c_name = Column(String(255), nullable=False)
    c_number = Column(Integer, nullable=False)
    c_photo = Column(String(1000))
    major_id = Column(Integer, ForeignKey('majors.major_id'), nullable=False)
    c_photo_type = Column(String(50))
    c_gender = Column(Enum('boy', 'girl'), nullable=False)

class Vote(Base):
    __tablename__ = 'votes'
    __table_args__ = (UniqueConstraint('voter_id', 'title_id', name='uq_vote_voter_title'),)
    vote_id = Column(Integer, primary_key=True)
    voter_id = Column(Integer, ForeignKey('voter_info.voter_id'), nullable=False)
    c_id = Column(Integer, nullable=False, default=0)
    title_id = Column(Integer, ForeignKey('titles.title_id'), nullable=False)

class MajorSelection(Base):
    __tablename__ = 'major_selection'
    __table_args__ = (
        UniqueConstraint('target_id', 'year', 'title_id', name='uq_major_award_target_year_title'),
        UniqueConstraint('target_id', 'year', 'c_id', name='uq_major_award_target_year_candidate'),
    )
    m_id = Column(Integer, primary_key=True)
    c_id = Column(Integer, ForeignKey('candidates.c_id'), nullable=False)
    title_id = Column(Integer, ForeignKey('titles.title_id'), nullable=False)
    target_id = Column(Integer, nullable=False)
    total_vote_weight = Column(Integer, nullable=False, default=0)
    year = Column(Integer, nullable=False)

class WholeCandidate(Base):
    __tablename__ = 'whole_candidate'
    __table_args__ = (
        UniqueConstraint('c_w_number', name='uq_whole_candidate_number'),
    )
    c_w_id = Column(Integer, primary_key=True)
    c_id = Column(Integer, ForeignKey('candidates.c_id'), unique=True, nullable=False)
    c_w_number = Column(Integer, nullable=False)

class WholeSelection(Base):
    __tablename__ = 'the_whole_selection'
    __table_args__ = (
        UniqueConstraint('year', 'title_id', name='uq_whole_award_year_title'),
        UniqueConstraint('year', 'c_id', name='uq_whole_award_year_candidate'),
    )
    w_id = Column(Integer, primary_key=True)
    c_id = Column(Integer, ForeignKey('candidates.c_id'), nullable=False)
    title_id = Column(Integer, ForeignKey('titles.title_id'), nullable=False)
    total_vote_weight = Column(Integer, nullable=False, default=0)
    year = Column(Integer, nullable=False)
