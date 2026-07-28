# Política de Privacidade — Prismi Dashboard

Última atualização: 23 de julho de 2026

Esta política descreve como o Prismi Dashboard coleta, usa e compartilha informações dos usuários.

## Armazenamento de dados

O Prismi Dashboard **não possui servidores, não coleta dados pessoais e não compartilha informações com terceiros para fins de rastreamento ou publicidade.**

Todos os dados criados pelo usuário (boards, widgets, links, notas, configurações de tema e wallpapers) são armazenados **exclusivamente no armazenamento local do navegador** (`browser.storage.local`) e nunca saem do dispositivo.

## APIs de terceiros utilizadas

A extensão faz requisições de rede às seguintes APIs exclusivamente para funcionalidades solicitadas pelo usuário:

| Serviço | Dados enviados | Finalidade |
|---|---|---|
| **Google Favicons** (`www.google.com/s2/favicons`) | Domínio do link salvo pelo usuário | Exibir o favicon do site ao lado do link |
| **Open-Meteo** (`api.open-meteo.com`) | Coordenadas geográficas (latitude/longitude) ou nome da cidade | Obter previsão do tempo |
| **Open-Meteo Geocoding** (`geocoding-api.open-meteo.com`) | Nome da cidade digitado pelo usuário | Converter nome de cidade em coordenadas |
| **BigDataCloud** (`api.bigdatacloud.net`) | Coordenadas geográficas (latitude/longitude) | Converter coordenadas em nome de cidade |
| **Mecanismo de busca escolhido** (Google, Yahoo, Bing ou DuckDuckGo) | Consulta de busca digitada pelo usuário | Sugestões de autocomplete na barra de pesquisa |

### Geolocalização

O widget de clima **pode** solicitar acesso à localização do dispositivo (via `navigator.geolocation`) **caso o usuário não informe uma cidade manualmente**. Essa solicitação é opcional e o usuário pode negá-la. As coordenadas obtidas são enviadas apenas às APIs de clima e geocodificação listadas acima.

## Dados coletados pela extensão

A extensão **não coleta, armazena ou transmite** nenhum dado de navegação, histórico, cookies ou informações pessoais do usuário para servidores próprios.

## Compartilhamento com terceiros

Nenhum dado do usuário é vendido, alugado ou compartilhado com terceiros para fins comerciais.

## Código aberto

O código-fonte completo da extensão está disponível sob licença MIT e pode ser auditado publicamente.

## Contato

Para dúvidas sobre esta política de privacidade, abra uma issue no repositório oficial da extensão ou entre em contato pelo e-mail disponível na página do desenvolvedor no AMO.
