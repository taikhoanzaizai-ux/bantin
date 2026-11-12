"""Owner edition only. This file must never be in the customer package."""
from local_server import run
class OwnerLicense:
    device='Bản dành riêng cho chủ sở hữu'
    def check(self,force=False):return {'ok':True,'owner':True,'customer':'Chủ sở hữu','expires_at':None,'message':'Bản chủ sở hữu không giới hạn.'}
    def activate(self,key):return self.check()
if __name__=='__main__':run(OwnerLicense(),8787)
