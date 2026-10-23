export function download(data,name,type='text/plain;charset=utf-8'){
  const url=URL.createObjectURL(data instanceof Blob?data:new Blob([data],{type}));
  const link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
