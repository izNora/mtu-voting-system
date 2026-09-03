import argparse
from app.database import SessionLocal
from app.qr_service import ensure_all_targets

def main():
    parser=argparse.ArgumentParser(description="Generate QR codes for one festival/major. Use major-id 0 for Whole.")
    parser.add_argument("--major-id",type=int,required=True)
    parser.add_argument("--students",type=int,required=True)
    parser.add_argument("--teachers",type=int,required=True)
    args=parser.parse_args()
    db=SessionLocal()
    try:
        result=ensure_all_targets(args.major_id,args.students,args.teachers,db)
        print("Festival major_id:",args.major_id)
        print("Students created:",result["students"]["created_count"])
        print("Teachers created:",result["teachers"]["created_count"])
    finally: db.close()
if __name__=="__main__": main()
