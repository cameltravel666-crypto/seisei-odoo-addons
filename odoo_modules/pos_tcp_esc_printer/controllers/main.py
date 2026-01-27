import base64
from io import BytesIO
import json
from time import sleep
from escpos.printer import Network
from odoo.http import Controller, route, request
from PIL import Image

class EventController(Controller):
    @route(['/pos_tcp_esc_printer/print'], type='json', auth='public', methods=['POST'], csrf=False)#pos_tcp_esc_printer
    def event_my_tickets(self):
        data = json.loads(request.httprequest.data)

        imgs = self.imgcrop(Image.open(BytesIO(base64.b64decode(data['img']))))

        printer = Network(data['ip'], profile="TM-T88IV")
        for img in imgs:
            printer.image(img)
        printer.cut()
        sleep(3)
        printer.close()
        return "OK"
    

    def imgcrop(self, im):
        ret = []
        imgwidth, imgheight = im.size

        xPieces = 1
        yPieces = int(imgheight / 20)

        height = imgheight // yPieces
        width = imgwidth // xPieces
        for i in range(0, yPieces):
            for j in range(0, xPieces):
                end = (i + 1) * height
                if(yPieces == i + 1):
                    end = imgheight
                box = (j * width, i * height, (j + 1) * width, end)
                ret.append(im.crop(box))        
        return ret                   
